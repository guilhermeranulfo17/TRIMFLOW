'use server';

import { sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { limitesDoMes } from '@/domain/agenda';
import { hojeNoFuso } from '@/domain/dates';
import { celularBRParaE164 } from '@/domain/phone';
import {
  dadosDoContexto,
  motivoDoBotaoDesabilitado,
  montarPrevia,
  origemDoParametro,
  traduzirErroPublico,
  type Escolhas,
  type Previa,
  type Sugestao,
} from '@/domain/publico';
import { slugValido } from '@/domain/slug';
import {
  contatoSchema,
  escolhasSchema,
  funilSchema,
  TEXTO_CONSENTIMENTO,
  VERSAO_CONSENTIMENTO,
  visitaSchema,
  type ContatoEntrada,
  type EscolhasEntrada,
  type VisitaEntrada,
} from '@/domain/validacao/publico';
import { comAnon } from '@/server/db/anon';
import { prepararVersao, type DadosVersao } from '@/server/proposta/versao';
import { carregarBuffet, carregarContextoPublico } from '@/server/publico/carregar';
import {
  cookieDoOrcamento,
  ehModoTeste,
  lerTokenDoCookie,
  OPCOES_COOKIE,
} from '@/server/publico/sessao';
import {
  hashIpDoVisitante,
  TEMPO_MAXIMO_MS,
  TEMPO_MINIMO_MS,
  tempoDesde,
} from '@/server/publico/seguranca';

/*
 * Server actions do link público. Recebem SÓ escolhas e contato: "hoje", fuso, preço,
 * desconto (sempre zero) e modo teste vêm do servidor. Tudo vai ao banco pelas funções do
 * schema publico, como anon. Logs: só códigos, nunca nome, WhatsApp ou IP.
 */

export type ResultadoPublico<T = undefined> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; codigo?: string; campos?: Record<string, string> };

const TOKEN_REGEX = /^[A-Za-z0-9_-]{32,}$/;

function codigoDoErro(erro: unknown): string | undefined {
  const e = erro as { message?: string; cause?: { message?: string } } | null;
  const msg = e?.cause?.message ?? e?.message;
  return msg && /^[A-Z_]+$/.test(msg) ? msg : undefined;
}

function falha<T>(erro: unknown, onde: string): ResultadoPublico<T> {
  const codigo = codigoDoErro(erro);
  if (!codigo) console.error(`[publico:${onde}] erro inesperado`);
  return { ok: false, erro: traduzirErroPublico(codigo), ...(codigo ? { codigo } : {}) };
}

function invalido<T>(erro = 'Confira os dados e tente de novo.'): ResultadoPublico<T> {
  return { ok: false, erro };
}

function escolhasValidas(entrada: EscolhasEntrada): Escolhas | null {
  const r = escolhasSchema.safeParse(entrada);
  return r.success ? r.data : null;
}

type EstadoOrcamento = {
  status: string;
  passo_atual: number;
  eh_teste: boolean;
  numero: number;
  token: string;
  cliente_nome: string | null;
  rascunho: unknown;
};

async function estadoDoToken(slug: string, token: string): Promise<EstadoOrcamento | null> {
  const [linha] = await comAnon((tx) =>
    tx.execute<{ e: EstadoOrcamento | null }>(
      sql`select publico.estado_orcamento(${slug}, ${token}) as e`,
    ),
  );
  return linha?.e ?? null;
}

/**
 * Orçamento do cookie (ou do token informado), só se existe neste buffet e ainda aceita
 * mudanças. Devolve o token da VERSÃO VIGENTE e o nome do cliente (abertura da proposta).
 */
async function emAndamento(
  slug: string,
  token: string | null = null,
): Promise<{ token: string; clienteNome: string } | null> {
  token ??= await lerTokenDoCookie(slug);
  if (!token) return null;
  const estado = await estadoDoToken(slug, token);
  if (!estado || !['em_montagem', 'enviado', 'visualizado', 'expirado'].includes(estado.status)) {
    return null;
  }
  return { token: estado.token, clienteNome: estado.cliente_nome ?? '' };
}

async function tokenEmAndamento(slug: string, token: string | null = null): Promise<string | null> {
  return (await emAndamento(slug, token))?.token ?? null;
}

function camposDoRascunho(e: Escolhas, espacoUnico: string | undefined) {
  const convidados = (e.adultos ?? 0) + e.criancas.reduce((n, c) => n + c.quantidade, 0);
  return {
    tipoEventoId: e.tipoEventoId ?? null,
    data: e.data ?? null,
    turnoId: e.turnoId ?? null,
    espacoId: e.espacoId ?? espacoUnico ?? null,
    convidados: convidados > 0 ? convidados : null,
  };
}

// ---------------------------------------------------------------------------
// Passo 2: calendário
// ---------------------------------------------------------------------------

export type DiaDisponivel = {
  data: string;
  turnoId: string;
  espacoId: string;
  disponivel: boolean;
};

export async function verDisponibilidade(
  slug: string,
  mes: string,
  espacoId?: string,
): Promise<ResultadoPublico<DiaDisponivel[]>> {
  if (!slugValido(slug) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return invalido();
  if (espacoId !== undefined && !/^[0-9a-f-]{36}$/i.test(espacoId)) return invalido();
  try {
    const { de, ate } = limitesDoMes(mes);
    const linhas = await comAnon((tx) =>
      tx.execute<{ data: string; turno_id: string; espaco_id: string; disponivel: boolean }>(
        sql`select data::text, turno_id, espaco_id, disponivel
            from publico.disponibilidade(${slug}, ${de}::date, ${ate}::date, ${espacoId ?? null})`,
      ),
    );
    return {
      ok: true,
      dados: linhas.map((l) => ({
        data: l.data,
        turnoId: l.turno_id,
        espacoId: l.espaco_id,
        disponivel: l.disponivel,
      })),
    };
  } catch (erro) {
    return falha(erro, 'disponibilidade');
  }
}

// ---------------------------------------------------------------------------
// Prévia de preço (e rascunho, depois do WhatsApp)
// ---------------------------------------------------------------------------

export async function calcularPrevia(
  slug: string,
  entrada: EscolhasEntrada,
  passo: number,
): Promise<ResultadoPublico<Previa>> {
  const escolhas = escolhasValidas(entrada);
  if (!slugValido(slug) || !escolhas || !Number.isInteger(passo) || passo < 1 || passo > 6) {
    return invalido();
  }
  try {
    const contexto = await carregarContextoPublico(slug);
    if (!contexto) return invalido('Este buffet não está recebendo orçamentos pelo link agora.');
    const token = await tokenEmAndamento(slug);
    const previa = montarPrevia(contexto.ctx, escolhas, {
      hoje: hojeNoFuso(contexto.fuso),
      comContato: token !== null,
      modo: contexto.ctx.regras.modoExibicaoPreco,
    });
    if (token) {
      const espacoUnico =
        contexto.ctx.espacos.length === 1 ? contexto.ctx.espacos[0]!.id : undefined;
      const c = camposDoRascunho(escolhas, espacoUnico);
      await comAnon((tx) =>
        tx.execute(sql`select publico.atualizar_rascunho(${slug}, ${token},
          ${JSON.stringify(escolhas)}::jsonb, ${passo}::smallint, ${c.tipoEventoId}, ${c.data}::date,
          ${c.turnoId}, ${c.espacoId}, ${c.convidados})`),
      );
    }
    return { ok: true, dados: previa };
  } catch (erro) {
    return falha(erro, 'previa');
  }
}

// ---------------------------------------------------------------------------
// Passo 3: WhatsApp (o lead nasce aqui)
// ---------------------------------------------------------------------------

export async function iniciarOrcamento(
  slug: string,
  dados: { contato: ContatoEntrada; escolhas: EscolhasEntrada; origem?: string },
): Promise<ResultadoPublico<Previa>> {
  const escolhas = escolhasValidas(dados.escolhas);
  if (!slugValido(slug) || !escolhas) return invalido();
  const contato = contatoSchema.safeParse(dados.contato);
  if (!contato.success) {
    const campos: Record<string, string> = {};
    for (const issue of contato.error.issues) campos[String(issue.path[0])] ??= issue.message;
    return { ok: false, erro: 'Confira os campos destacados.', campos };
  }
  const c = contato.data;

  // Robôs: preenchem o campo invisível ou enviam rápido demais. Nenhum lead é criado.
  const tempo = tempoDesde(c.inicio);
  if (c.site || tempo === null || tempo < TEMPO_MINIMO_MS) {
    return invalido('Não foi possível continuar. Confira os dados e tente de novo.');
  }
  if (tempo > TEMPO_MAXIMO_MS) {
    return invalido('A página ficou aberta por muito tempo. Recarregue e tente de novo.');
  }
  const whatsapp = celularBRParaE164(c.whatsapp);
  if (!whatsapp) {
    return {
      ok: false,
      erro: 'Confira os campos destacados.',
      campos: { whatsapp: 'Informe um celular com DDD, ex.: (34) 99135-5450.' },
    };
  }

  try {
    const contexto = await carregarContextoPublico(slug);
    if (!contexto) return invalido('Este buffet não está recebendo orçamentos pelo link agora.');
    for (const passo of [1, 2] as const) {
      const motivo = motivoDoBotaoDesabilitado(
        passo,
        escolhas,
        dadosDoContexto(contexto.ctx, escolhas),
      );
      if (motivo) return invalido(motivo);
    }
    const teste = await ehModoTeste(slug);
    const ipHash = await hashIpDoVisitante();
    const espacoUnico = contexto.ctx.espacos.length === 1 ? contexto.ctx.espacos[0]!.id : undefined;
    const r = camposDoRascunho(escolhas, espacoUnico);
    const [linha] = await comAnon((tx) =>
      tx.execute<{ token: string }>(sql`select publico.iniciar_orcamento(
        ${slug}, ${c.nome}, ${whatsapp}, ${VERSAO_CONSENTIMENTO}, ${TEXTO_CONSENTIMENTO},
        ${origemDoParametro(dados.origem)}::public.origem_lead, ${JSON.stringify(escolhas)}::jsonb,
        ${r.tipoEventoId}, ${r.data}::date, ${r.turnoId}, ${r.espacoId}, ${r.convidados},
        ${ipHash}, ${teste}) as token`),
    );
    (await cookies()).set(cookieDoOrcamento(slug), linha!.token, OPCOES_COOKIE(slug));

    const previa = montarPrevia(contexto.ctx, escolhas, {
      hoje: hojeNoFuso(contexto.fuso),
      comContato: true,
      modo: contexto.ctx.regras.modoExibicaoPreco,
    });
    return { ok: true, dados: previa };
  } catch (erro) {
    return falha(erro, 'iniciar');
  }
}

// ---------------------------------------------------------------------------
// Passo 5 → 6: concluir (o servidor calcula e congela)
// ---------------------------------------------------------------------------

export async function concluirOrcamento(
  slug: string,
  entrada: EscolhasEntrada,
): Promise<ResultadoPublico<{ token: string }>> {
  return concluir(slug, entrada, null);
}

/** Calcula no servidor (motor) e monta a versão a congelar; erro do motor vira mensagem. */
async function prepararPublica(
  slug: string,
  contexto: NonNullable<Awaited<ReturnType<typeof carregarContextoPublico>>>,
  escolhas: Escolhas,
  clienteNome: string,
): Promise<ResultadoPublico<DadosVersao>> {
  const hoje = hojeNoFuso(contexto.fuso);
  const { resultado } = montarPrevia(contexto.ctx, escolhas, {
    hoje,
    comContato: true,
    modo: contexto.ctx.regras.modoExibicaoPreco,
  });
  if (!resultado) return invalido('Escolha um pacote.');
  if (!resultado.ok) {
    return {
      ok: false,
      erro: resultado.erros[0]?.mensagem ?? 'Confira os dados.',
      codigo: 'MOTOR',
    };
  }
  const buffet = await carregarBuffet(slug);
  return {
    ok: true,
    dados: prepararVersao({
      ctx: contexto.ctx,
      escolhas,
      resultado,
      hoje,
      textos: contexto.textos,
      aberturaModelo: contexto.aberturaPorTipo[escolhas.tipoEventoId ?? ''] ?? null,
      clienteNome,
      buffetNome: buffet?.nome ?? '',
    }),
  };
}

async function concluir(
  slug: string,
  entrada: EscolhasEntrada,
  tokenInformado: string | null,
): Promise<ResultadoPublico<{ token: string }>> {
  const escolhas = escolhasValidas(entrada);
  if (!slugValido(slug) || !escolhas) return invalido();
  try {
    const contexto = await carregarContextoPublico(slug);
    if (!contexto) return invalido('Este buffet não está recebendo orçamentos pelo link agora.');
    const atual = await emAndamento(slug, tokenInformado);
    if (!atual) {
      return {
        ok: false,
        erro: traduzirErroPublico('PUBLICO_ORCAMENTO_NAO_ENCONTRADO'),
        codigo: 'SEM_TOKEN',
      };
    }
    const preparada = await prepararPublica(slug, contexto, escolhas, atual.clienteNome);
    if (!preparada.ok) return preparada;
    const v = preparada.dados;
    const [linha] = await comAnon((tx) =>
      tx.execute<{ token: string }>(sql`select publico.concluir_versao(
        ${slug}, ${atual.token}, ${JSON.stringify(v.resultado)}::jsonb, ${JSON.stringify(v.itens)}::jsonb,
        ${v.resultado.totalCentavos}, ${v.validade}::date, ${JSON.stringify(escolhas)}::jsonb,
        ${v.campos.tipoEventoId}, ${v.campos.data}::date, ${v.campos.turnoId}, ${v.campos.espacoId},
        ${v.campos.convidados}, ${v.campos.pacoteId}, ${JSON.stringify(v.conteudo)}::jsonb) as token`),
    );
    (await cookies()).set(cookieDoOrcamento(slug), linha!.token, OPCOES_COOKIE(slug));
    return { ok: true, dados: { token: linha!.token } };
  } catch (erro) {
    return falha(erro, 'concluir');
  }
}

// ---------------------------------------------------------------------------
// Proposta: reservar, visitar, WhatsApp
// ---------------------------------------------------------------------------

export type ResultadoPreReserva =
  | {
      reservado: true;
      simulada: boolean;
      expiraEm: string;
      sinalCentavos: number;
      totalCentavos: number;
    }
  | { reservado: false; codigo: 'SLOT_INDISPONIVEL'; sugestoes: Sugestao[] }
  /** existe versão mais nova: a tela recarrega na vigente */
  | { reservado: false; atualizada: true; token: string };

type RetornoSql = {
  ok: boolean;
  codigo?: string;
  simulada?: boolean;
  expira_em?: string;
  sinal_centavos?: number;
  total_centavos?: number;
  sugestoes?: { data: string; turno_id: string }[];
  token?: string;
};

export async function preReservar(
  slug: string,
  token: string,
): Promise<ResultadoPublico<ResultadoPreReserva>> {
  if (!slugValido(slug) || !TOKEN_REGEX.test(token)) return invalido();
  try {
    const ipHash = await hashIpDoVisitante();
    const [linha] = await comAnon((tx) =>
      tx.execute<{ r: RetornoSql }>(
        sql`select publico.pre_reservar(${slug}, ${token}, ${ipHash}) as r`,
      ),
    );
    const r = linha!.r;
    if (r.ok) {
      return {
        ok: true,
        dados: {
          reservado: true,
          simulada: r.simulada ?? false,
          expiraEm: r.expira_em!,
          sinalCentavos: r.sinal_centavos ?? 0,
          totalCentavos: r.total_centavos ?? 0,
        },
      };
    }
    if (r.codigo === 'PROPOSTA_ATUALIZADA' && r.token) {
      return { ok: true, dados: { reservado: false, atualizada: true, token: r.token } };
    }
    if (r.codigo === 'SLOT_INDISPONIVEL') {
      return {
        ok: true,
        dados: {
          reservado: false,
          codigo: 'SLOT_INDISPONIVEL',
          sugestoes: (r.sugestoes ?? []).map((s) => ({ data: s.data, turnoId: s.turno_id })),
        },
      };
    }
    return {
      ok: false,
      erro: traduzirErroPublico(r.codigo),
      ...(r.codigo ? { codigo: r.codigo } : {}),
    };
  } catch (erro) {
    return falha(erro, 'pre-reserva');
  }
}

export async function pedirVisita(
  slug: string,
  token: string,
  entrada: VisitaEntrada,
): Promise<ResultadoPublico> {
  if (!slugValido(slug) || !TOKEN_REGEX.test(token)) return invalido();
  const v = visitaSchema.safeParse(entrada);
  if (!v.success) return invalido(v.error.issues[0]?.message);
  try {
    const ipHash = await hashIpDoVisitante();
    await comAnon((tx) =>
      tx.execute(sql`select publico.solicitar_visita(${slug}, ${token},
        ${v.data.dataPreferida}::date, ${v.data.periodo}::public.periodo_visita,
        ${v.data.observacoes ?? null}, ${ipHash})`),
    );
    return { ok: true, dados: undefined };
  } catch (erro) {
    return falha(erro, 'visita');
  }
}

/** Clique em "Tirar dúvidas no WhatsApp" (vai para a linha do tempo do lead). */
export async function registrarWhatsapp(slug: string, token: string): Promise<void> {
  if (!slugValido(slug) || !TOKEN_REGEX.test(token)) return;
  try {
    await comAnon((tx) =>
      tx.execute(sql`select publico.registrar_atividade(${slug}, ${token}, 'whatsapp_clicado')`),
    );
  } catch {
    // Registro de clique nunca atrapalha o cliente.
  }
}

/** Funil do wizard (sem dado pessoal). Modo teste não conta. */
export async function registrarFunil(
  slug: string,
  entrada: { sessao: string; passo: number; evento: string; origem?: string },
): Promise<void> {
  const f = funilSchema.safeParse(entrada);
  if (!slugValido(slug) || !f.success) return;
  try {
    const [teste, ipHash] = await Promise.all([ehModoTeste(slug), hashIpDoVisitante()]);
    await comAnon((tx) =>
      tx.execute(sql`select publico.registrar_funil(${slug}, ${f.data.sessao}::uuid,
        ${f.data.passo}::smallint, ${f.data.evento}::public.evento_funil,
        ${origemDoParametro(f.data.origem)}::public.origem_lead, ${ipHash}, ${teste})`),
    );
  } catch {
    // Métrica nunca atrapalha o cliente.
  }
}

/**
 * Sugestão de data depois de SLOT_INDISPONIVEL: refaz o orçamento com a nova data/turno
 * (o preço pode mudar com o dia) e devolve o token da proposta nova.
 */
export async function escolherOutraData(
  slug: string,
  token: string,
  sugestao: { data: string; turnoId: string },
): Promise<ResultadoPublico<{ token: string }>> {
  if (!slugValido(slug) || !TOKEN_REGEX.test(token)) return invalido();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sugestao.data) || !/^[0-9a-f-]{36}$/i.test(sugestao.turnoId)) {
    return invalido();
  }
  try {
    const [linha] = await comAnon((tx) =>
      tx.execute<{ e: { status: string; rascunho: unknown } | null }>(
        sql`select publico.estado_orcamento(${slug}, ${token}) as e`,
      ),
    );
    const estado = linha?.e;
    const atual = estado ? escolhasSchema.safeParse(estado.rascunho) : null;
    if (!estado || !atual?.success || !['enviado', 'visualizado'].includes(estado.status)) {
      return { ok: false, erro: traduzirErroPublico('PUBLICO_ORCAMENTO_FECHADO') };
    }
    return concluir(slug, { ...atual.data, data: sugestao.data, turnoId: sugestao.turnoId }, token);
  } catch (erro) {
    return falha(erro, 'outra-data');
  }
}

/** "Refazer com os preços atuais" / "Montar outro orçamento": esquece o orçamento atual. */
export async function recomecarOrcamento(slug: string): Promise<void> {
  if (!slugValido(slug)) return;
  (await cookies()).delete({ name: cookieDoOrcamento(slug), path: `/b/${slug}` });
}

/**
 * "Atualizar com os preços de hoje" (proposta vencida): recalcula as mesmas escolhas e cria uma
 * versão nova. Se a data não é mais possível, devolve DATA_IMPOSSIVEL e deixa o wizard pronto
 * (cookie com o orçamento) para o cliente escolher outra data.
 */
export async function atualizarPrecos(
  slug: string,
  token: string,
): Promise<ResultadoPublico<{ token: string }>> {
  if (!slugValido(slug) || !TOKEN_REGEX.test(token)) return invalido();
  try {
    const estado = await estadoDoToken(slug, token);
    const escolhas = estado ? escolhasSchema.safeParse(estado.rascunho) : null;
    if (!estado || estado.status !== 'expirado' || !escolhas?.success) {
      return { ok: false, erro: traduzirErroPublico('PUBLICO_ORCAMENTO_FECHADO') };
    }
    const contexto = await carregarContextoPublico(slug);
    if (!contexto) return invalido('Este buffet não está recebendo orçamentos pelo link agora.');
    (await cookies()).set(cookieDoOrcamento(slug), estado.token, OPCOES_COOKIE(slug));
    const preparada = await prepararPublica(
      slug,
      contexto,
      escolhas.data,
      estado.cliente_nome ?? '',
    );
    if (!preparada.ok) {
      return {
        ok: false,
        erro: 'Essa data não está mais disponível com os preços de hoje. Escolha outra data.',
        codigo: 'DATA_IMPOSSIVEL',
      };
    }
    const v = preparada.dados;
    const [linha] = await comAnon((tx) =>
      tx.execute<{ token: string }>(sql`select publico.atualizar_precos(
        ${slug}, ${estado.token}, ${JSON.stringify(v.resultado)}::jsonb, ${JSON.stringify(v.itens)}::jsonb,
        ${v.resultado.totalCentavos}, ${v.validade}::date, ${JSON.stringify(escolhas.data)}::jsonb,
        ${v.campos.tipoEventoId}, ${v.campos.data}::date, ${v.campos.turnoId}, ${v.campos.espacoId},
        ${v.campos.convidados}, ${v.campos.pacoteId}, ${JSON.stringify(v.conteudo)}::jsonb) as token`),
    );
    (await cookies()).set(cookieDoOrcamento(slug), linha!.token, OPCOES_COOKIE(slug));
    return { ok: true, dados: { token: linha!.token } };
  } catch (erro) {
    return falha(erro, 'atualizar-precos');
  }
}

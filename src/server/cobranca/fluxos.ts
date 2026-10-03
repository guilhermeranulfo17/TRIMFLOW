import 'server-only';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  lerCobranca,
  type EventoNormalizado,
  limparPayload,
  normalizarEvento,
} from '@/domain/cobranca/asaas-eventos';
import { documentoValido, limparDocumento } from '@/domain/cobranca/documento';
import {
  type Ciclo,
  type Cupom,
  fimDoCupom,
  normalizarCodigoCupom,
  precoDoCiclo,
  primeiroVencimento,
  validarCupom,
  valorDaAssinatura,
} from '@/domain/cobranca/precos';
import { hojeNoFuso, somarDias } from '@/domain/dates';
import type { Db } from '@/server/db/client';
import {
  assinaturas,
  auditoria,
  cobrancas,
  cupons,
  cuponsUsos,
  empresas,
  empresasCobranca,
  planos,
} from '@/server/db/schema';
import { type ClienteAsaas, cicloAsaas, ErroAsaas } from './asaas';

/*
 * Fluxos da cobrança. Rodam pela conexão administrativa (sem RLS): quem chama já conferiu o
 * perfil (dono, ou admin do /interno). Asaas e banco são injetados (testes usam a API falsa).
 * Toda escrita deixa auditoria. Mensagens de erro: simples, para mostrar na tela.
 */

export type DepsCobranca = { db: Db; asaas: ClienteAsaas; agora?: () => Date };

export type Resultado<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { dados: T }))
  | { ok: false; erro: string; codigo?: string };

export const ERRO_ASAAS =
  'Não conseguimos falar com o sistema de pagamento agora. Tente de novo em alguns minutos.';

export const VALOR_IMPLANTACAO_CENTAVOS = 49_700;

const agoraDe = (d: DepsCobranca) => (d.agora ?? (() => new Date()))();

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// ---------------------------------------------------------------------------
// Eventos (webhook e reconciliação)
// ---------------------------------------------------------------------------

const paraSql = (e: EventoNormalizado) => ({
  evento_id: e.eventoId,
  tipo: e.tipo,
  tratado: e.tratado,
  cobranca: e.cobranca && {
    asaas_id: e.cobranca.asaasId,
    assinatura_asaas_id: e.cobranca.assinaturaAsaasId,
    cliente_asaas_id: e.cobranca.clienteAsaasId,
    valor_centavos: e.cobranca.valorCentavos,
    vencimento: e.cobranca.vencimento,
    status: e.cobranca.status,
    forma: e.cobranca.forma,
    link_fatura: e.cobranca.linkFatura,
    pago_em: e.cobranca.pagoEm,
    referencia: e.cobranca.referencia,
  },
  assinatura_cancelada: e.assinaturaCancelada && {
    asaas_id: e.assinaturaCancelada.asaasId,
    referencia: e.assinaturaCancelada.referencia,
  },
});

export async function registrarEvento(
  db: Db | Tx,
  evento: EventoNormalizado,
  payload: Record<string, unknown> = {},
): Promise<string> {
  const [l] = await db.execute<{ r: string }>(
    sql`select public.cobranca_registrar_evento(${JSON.stringify(paraSql(evento))}::jsonb,
      ${JSON.stringify(payload)}::jsonb) as r`,
  );
  return l!.r;
}

/** Corpo do webhook → resultado gravado (null = payload inválido). */
export async function processarWebhook(db: Db, corpo: unknown): Promise<string | null> {
  const evento = normalizarEvento(corpo);
  if (!evento) return null;
  return registrarEvento(db, evento, limparPayload(corpo));
}

/** Cobrança lida da API vira evento sintético idempotente (mesmo id = mesmo status). */
async function registrarCobrancaLida(db: Db | Tx, origem: string, pagamento: unknown) {
  const c = lerCobranca(pagamento);
  if (!c) return null;
  return registrarEvento(db, {
    eventoId: `${origem}:${c.asaasId}:${c.status}`,
    tipo: `${origem.toUpperCase()}_${c.status.toUpperCase()}`,
    tratado: true,
    cobranca: c,
    assinaturaCancelada: null,
  });
}

// ---------------------------------------------------------------------------
// Leituras de apoio
// ---------------------------------------------------------------------------

async function lerEmpresa(db: Db | Tx, empresaId: string) {
  const [e] = await db
    .select({
      id: empresas.id,
      nome: empresas.nome,
      fuso: empresas.fuso,
      trialAte: empresas.trialAte,
      plano: empresas.plano,
    })
    .from(empresas)
    .where(eq(empresas.id, empresaId));
  return e ?? null;
}

async function lerCupom(db: Db | Tx, codigo: string): Promise<(Cupom & { id: string }) | null> {
  const [c] = await db
    .select()
    .from(cupons)
    .where(sql`upper(${cupons.codigo}) = ${normalizarCodigoCupom(codigo)}`);
  if (!c) return null;
  return {
    id: c.id,
    codigo: c.codigo,
    planoCodigo: c.planoCodigo,
    ciclo: c.ciclo,
    descontoCentavos: c.descontoCentavos,
    duracaoMeses: c.duracaoMeses,
    maxUsos: c.maxUsos,
    usos: c.usos,
    validoAte: c.validoAte,
    ativo: c.ativo,
  };
}

async function jaUsouCupom(db: Db | Tx, cupomId: string, empresaId: string) {
  const r = await db
    .select({ id: cuponsUsos.id })
    .from(cuponsUsos)
    .where(and(eq(cuponsUsos.cupomId, cupomId), eq(cuponsUsos.empresaId, empresaId)));
  return r.length > 0;
}

async function assinaturaNaoCancelada(db: Db | Tx, empresaId: string) {
  const [a] = await db
    .select()
    .from(assinaturas)
    .where(and(eq(assinaturas.empresaId, empresaId), ne(assinaturas.status, 'cancelada')));
  return a ?? null;
}

async function auditar(
  db: Db | Tx,
  empresaId: string,
  usuarioId: string | null,
  acao: string,
  entidadeId: string | null,
  dados: Record<string, unknown>,
) {
  await db.insert(auditoria).values({
    empresaId,
    usuarioId,
    acao,
    entidade: 'assinatura',
    entidadeId,
    dados,
  });
}

/** Garante o cliente no Asaas com os dados de cobrança atuais (cria ou atualiza). */
async function garantirCliente(
  d: DepsCobranca,
  empresaId: string,
  dados: { nome: string; documento: string; email: string } | null,
): Promise<string> {
  const [atual] = await d.db
    .select()
    .from(empresasCobranca)
    .where(eq(empresasCobranca.empresaId, empresaId));
  const novos = dados ?? atual;
  if (!novos) throw new ErroAsaas('SEM_DADOS_COBRANCA');
  const doc = limparDocumento(novos.documento);
  let clienteId = atual?.asaasClienteId ?? null;
  const mudou =
    !atual ||
    atual.nome !== novos.nome ||
    atual.documento !== doc ||
    atual.email !== novos.email.toLowerCase();
  if (!clienteId) {
    clienteId = (
      await d.asaas.criarCliente({
        nome: novos.nome,
        documento: doc,
        email: novos.email,
        empresaId,
      })
    ).id;
  } else if (mudou) {
    await d.asaas.atualizarCliente(clienteId, {
      nome: novos.nome,
      documento: doc,
      email: novos.email,
    });
  }
  await d.db
    .insert(empresasCobranca)
    .values({
      empresaId,
      nome: novos.nome,
      documento: doc,
      email: novos.email.toLowerCase(),
      asaasClienteId: clienteId,
    })
    .onConflictDoUpdate({
      target: empresasCobranca.empresaId,
      set: {
        nome: novos.nome,
        documento: doc,
        email: novos.email.toLowerCase(),
        asaasClienteId: clienteId,
      },
    });
  return clienteId;
}

const descricao = (nomePlano: string, ciclo: Ciclo) =>
  `Orkestra ${nomePlano} (${ciclo === 'anual' ? 'anual' : 'mensal'})`;

/** Link da fatura em aberto mais antiga da assinatura (pendente ou vencida). */
async function faturaEmAberto(db: Db | Tx, assinaturaId: string) {
  const [c] = await db
    .select({ link: cobrancas.linkFatura })
    .from(cobrancas)
    .where(
      and(
        eq(cobrancas.assinaturaId, assinaturaId),
        inArray(cobrancas.status, ['pendente', 'vencida']),
      ),
    )
    .orderBy(cobrancas.vencimento)
    .limit(1);
  return c?.link ?? null;
}

/** Busca as cobranças da assinatura no Asaas e registra (a 1ª fatura aparece na hora). */
async function sincronizarCobrancas(d: DepsCobranca, asaasAssinaturaId: string) {
  const lista = await d.asaas.cobrancasDaAssinatura(asaasAssinaturaId);
  for (const p of lista) await registrarCobrancaLida(d.db, 'sinc', p);
  return lista;
}

// ---------------------------------------------------------------------------
// Assinar
// ---------------------------------------------------------------------------

export type EntradaAssinar = {
  empresaId: string;
  usuarioId: string;
  plano: string;
  ciclo: Ciclo;
  cupom?: string | null;
  dados: { nome: string; documento: string; email: string };
};

export async function assinar(
  d: DepsCobranca,
  e: EntradaAssinar,
): Promise<Resultado<{ urlFatura: string | null }>> {
  if (!documentoValido(e.dados.documento)) {
    return { ok: false, erro: 'CPF ou CNPJ inválido. Confira os números.' };
  }
  const empresa = await lerEmpresa(d.db, e.empresaId);
  const [plano] = await d.db.select().from(planos).where(eq(planos.codigo, e.plano));
  if (!empresa || !plano || !plano.ativo) return { ok: false, erro: 'Plano não encontrado.' };
  const agora = agoraDe(d);

  const vigente = await assinaturaNaoCancelada(d.db, e.empresaId);
  if (vigente?.status === 'ativa') {
    return { ok: false, erro: 'Sua assinatura já está ativa. Use "Mudar de plano".' };
  }
  const codigoCupom = e.cupom?.trim() ? normalizarCodigoCupom(e.cupom) : null;
  // pendente igual (dois cliques, voltou da fatura): devolve a mesma fatura
  const mesmaPendente =
    vigente &&
    vigente.planoCodigo === e.plano &&
    vigente.ciclo === e.ciclo &&
    (vigente.cupomCodigo ?? null) === codigoCupom;

  let cupom: (Cupom & { id: string }) | null = null;
  if (codigoCupom && !mesmaPendente) {
    const lido = await lerCupom(d.db, codigoCupom);
    const v = validarCupom(lido, {
      plano: e.plano,
      ciclo: e.ciclo,
      agora,
      // o uso reservado por uma pendente que será trocada volta antes de criar a nova
      jaUsou:
        lido && vigente?.cupomId !== lido.id
          ? await jaUsouCupom(d.db, lido.id, e.empresaId)
          : false,
    });
    if (!v.ok) return { ok: false, erro: v.erro, codigo: 'CUPOM' };
    cupom = lido;
  }

  try {
    if (vigente && mesmaPendente) {
      await garantirCliente(d, e.empresaId, e.dados);
      if (vigente.asaasAssinaturaId) await sincronizarCobrancas(d, vigente.asaasAssinaturaId);
      return { ok: true, dados: { urlFatura: await faturaEmAberto(d.db, vigente.id) } };
    }
    // pendente diferente: cancela a anterior (no Asaas e aqui) antes de criar a nova
    if (vigente) {
      if (vigente.asaasAssinaturaId) await d.asaas.cancelarAssinatura(vigente.asaasAssinaturaId);
      await d.db.transaction(async (tx) => {
        await tx
          .update(assinaturas)
          .set({ status: 'cancelada', canceladaEm: agora })
          .where(eq(assinaturas.id, vigente.id));
        // pendente nunca paga: o uso do cupom volta
        if (vigente.cupomId) {
          await tx
            .delete(cuponsUsos)
            .where(
              and(eq(cuponsUsos.cupomId, vigente.cupomId), eq(cuponsUsos.empresaId, e.empresaId)),
            );
          await tx
            .update(cupons)
            .set({ usos: sql`greatest(${cupons.usos} - 1, 0)` })
            .where(eq(cupons.id, vigente.cupomId));
        }
      });
    }

    const clienteId = await garantirCliente(d, e.empresaId, e.dados);
    const hoje = hojeNoFuso(empresa.fuso, agora);
    // ainda coberta por uma assinatura cancelada: começa depois dela
    const [coberta] = await d.db
      .select({ pagoAte: assinaturas.pagoAte })
      .from(assinaturas)
      .where(and(eq(assinaturas.empresaId, e.empresaId), eq(assinaturas.status, 'cancelada')))
      .orderBy(desc(assinaturas.pagoAte))
      .limit(1);
    const fimTeste =
      empresa.plano === 'trial' && empresa.trialAte
        ? hojeNoFuso(empresa.fuso, empresa.trialAte)
        : null;
    let vencimento = primeiroVencimento(hoje, fimTeste);
    if (coberta?.pagoAte && coberta.pagoAte >= vencimento)
      vencimento = somarDias(coberta.pagoAte, 1);

    const valor = valorDaAssinatura(plano, e.ciclo, cupom);
    const criada = await d.asaas.criarAssinatura({
      cliente: clienteId,
      valorCentavos: valor,
      vencimento,
      ciclo: cicloAsaas(e.ciclo),
      descricao: descricao(plano.nome, e.ciclo),
      empresaId: e.empresaId,
    });

    let assinaturaId: string;
    try {
      assinaturaId = await d.db.transaction(async (tx) => {
        const [a] = await tx
          .insert(assinaturas)
          .values({
            empresaId: e.empresaId,
            asaasAssinaturaId: criada.id,
            planoCodigo: plano.codigo,
            ciclo: e.ciclo,
            valorCentavos: valor,
            cupomId: cupom?.id ?? null,
            cupomCodigo: cupom?.codigo ?? null,
            cupomAte: cupom ? fimDoCupom(vencimento, cupom.duracaoMeses) : null,
          })
          .returning({ id: assinaturas.id });
        if (cupom) {
          await tx.execute(sql`select public.cobranca_reservar_cupom(${cupom.id}, ${e.empresaId})`);
        }
        await auditar(tx, e.empresaId, e.usuarioId, 'assinatura.criada', a!.id, {
          plano: plano.codigo,
          ciclo: e.ciclo,
          valor_centavos: valor,
          cupom: cupom?.codigo ?? null,
          vencimento,
        });
        return a!.id;
      });
    } catch (erro) {
      // compensa: a assinatura no Asaas não fica órfã
      await d.asaas.cancelarAssinatura(criada.id).catch(() => undefined);
      const msg =
        (erro as { cause?: { message?: string }; message?: string }).cause?.message ??
        (erro as { message?: string }).message;
      if (msg === 'CUPOM_ESGOTADO') {
        return { ok: false, erro: 'Este cupom acabou de esgotar.', codigo: 'CUPOM' };
      }
      if (msg === 'CUPOM_JA_USADO') {
        return { ok: false, erro: 'Sua empresa já usou este cupom.', codigo: 'CUPOM' };
      }
      throw erro;
    }

    await sincronizarCobrancas(d, criada.id);
    return { ok: true, dados: { urlFatura: await faturaEmAberto(d.db, assinaturaId) } };
  } catch (erro) {
    if (erro instanceof ErroAsaas) {
      console.error('[cobranca] assinar', erro.codigo);
      return { ok: false, erro: ERRO_ASAAS, codigo: erro.codigo };
    }
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Mudar de plano, cancelar, cupom e implantação
// ---------------------------------------------------------------------------

export async function mudarPlano(
  d: DepsCobranca,
  e: { empresaId: string; usuarioId: string | null; plano: string; ciclo: Ciclo; admin?: string },
): Promise<Resultado> {
  const a = await assinaturaNaoCancelada(d.db, e.empresaId);
  if (!a?.asaasAssinaturaId) return { ok: false, erro: 'Assine um plano primeiro.' };
  const [plano] = await d.db.select().from(planos).where(eq(planos.codigo, e.plano));
  if (!plano || !plano.ativo) return { ok: false, erro: 'Plano não encontrado.' };
  if (a.planoCodigo === e.plano && a.ciclo === e.ciclo) {
    return { ok: false, erro: 'Você já está neste plano.' };
  }
  // o cupom só continua se valer para o plano/ciclo novo e ainda estiver no prazo
  const empresa = await lerEmpresa(d.db, e.empresaId);
  const hoje = hojeNoFuso(empresa?.fuso ?? 'America/Sao_Paulo', agoraDe(d));
  let cupom: Cupom | null = null;
  if (a.cupomCodigo && a.cupomAte && a.cupomAte >= hoje) {
    const c = await lerCupom(d.db, a.cupomCodigo);
    if (c && c.planoCodigo === e.plano && c.ciclo === e.ciclo) cupom = c;
  }
  const valor = valorDaAssinatura(plano, e.ciclo, cupom);
  try {
    await d.asaas.atualizarAssinatura(a.asaasAssinaturaId, {
      valorCentavos: valor,
      ciclo: cicloAsaas(e.ciclo),
      descricao: descricao(plano.nome, e.ciclo),
    });
  } catch (erro) {
    if (erro instanceof ErroAsaas) return { ok: false, erro: ERRO_ASAAS, codigo: erro.codigo };
    throw erro;
  }
  await d.db.transaction(async (tx) => {
    await tx
      .update(assinaturas)
      .set({
        planoCodigo: plano.codigo,
        ciclo: e.ciclo,
        valorCentavos: valor,
        ...(cupom ? {} : { cupomId: null, cupomCodigo: null, cupomAte: null }),
      })
      .where(eq(assinaturas.id, a.id));
    await auditar(tx, e.empresaId, e.usuarioId, 'assinatura.plano_mudou', a.id, {
      antes: { plano: a.planoCodigo, ciclo: a.ciclo, valor_centavos: a.valorCentavos },
      depois: { plano: plano.codigo, ciclo: e.ciclo, valor_centavos: valor },
      ...(e.admin ? { admin: e.admin } : {}),
    });
  });
  return { ok: true };
}

export async function cancelarAssinatura(
  d: DepsCobranca,
  e: { empresaId: string; usuarioId: string; motivo: string; texto: string | null },
): Promise<Resultado> {
  const a = await assinaturaNaoCancelada(d.db, e.empresaId);
  if (!a) return { ok: false, erro: 'Não há assinatura para cancelar.' };
  try {
    if (a.asaasAssinaturaId) await d.asaas.cancelarAssinatura(a.asaasAssinaturaId);
  } catch (erro) {
    // já apagada no Asaas: segue cancelando aqui
    if (!(erro instanceof ErroAsaas && erro.status === 404)) {
      if (erro instanceof ErroAsaas) return { ok: false, erro: ERRO_ASAAS, codigo: erro.codigo };
      throw erro;
    }
  }
  await d.db.transaction(async (tx) => {
    await tx
      .update(assinaturas)
      .set({
        status: 'cancelada',
        canceladaEm: agoraDe(d),
        cancelamentoMotivo: e.motivo,
        cancelamentoTexto: e.texto,
      })
      .where(eq(assinaturas.id, a.id));
    await auditar(tx, e.empresaId, e.usuarioId, 'assinatura.cancelada', a.id, {
      motivo: e.motivo,
      pago_ate: a.pagoAte,
    });
    await tx.execute(sql`select public._atualizar_situacao(${e.empresaId})`);
  });
  return { ok: true };
}

/** /interno: aplica um cupom à assinatura existente (vale a partir da próxima fatura). */
export async function aplicarCupom(
  d: DepsCobranca,
  e: { empresaId: string; codigo: string; admin: string },
): Promise<Resultado> {
  const a = await assinaturaNaoCancelada(d.db, e.empresaId);
  if (!a?.asaasAssinaturaId) return { ok: false, erro: 'A empresa ainda não tem assinatura.' };
  const c = await lerCupom(d.db, e.codigo);
  const agora = agoraDe(d);
  const v = validarCupom(c, {
    plano: a.planoCodigo,
    ciclo: a.ciclo,
    agora,
    jaUsou: c ? await jaUsouCupom(d.db, c.id, e.empresaId) : false,
  });
  if (!v.ok || !c) return { ok: false, erro: v.ok ? 'Cupom não encontrado.' : v.erro };
  const [plano] = await d.db.select().from(planos).where(eq(planos.codigo, a.planoCodigo));
  const valor = valorDaAssinatura(plano!, a.ciclo, c);
  try {
    await d.asaas.atualizarAssinatura(a.asaasAssinaturaId, { valorCentavos: valor });
  } catch (erro) {
    if (erro instanceof ErroAsaas) return { ok: false, erro: ERRO_ASAAS, codigo: erro.codigo };
    throw erro;
  }
  const empresa = await lerEmpresa(d.db, e.empresaId);
  const hoje = hojeNoFuso(empresa?.fuso ?? 'America/Sao_Paulo', agora);
  await d.db.transaction(async (tx) => {
    await tx.execute(sql`select public.cobranca_reservar_cupom(${c.id}, ${e.empresaId})`);
    await tx
      .update(assinaturas)
      .set({
        valorCentavos: valor,
        cupomId: c.id,
        cupomCodigo: c.codigo,
        cupomAte: fimDoCupom(hoje, c.duracaoMeses),
      })
      .where(eq(assinaturas.id, a.id));
    await tx.execute(
      sql`select public.interno_registrar(${e.admin}, 'cupom.aplicado', ${e.empresaId},
        ${JSON.stringify({ cupom: c.codigo, valor_centavos: valor })}::jsonb)`,
    );
  });
  return { ok: true };
}

/** /interno: cobrança avulsa de implantação (R$ 497), vence em 3 dias. */
export async function criarImplantacao(
  d: DepsCobranca,
  e: { empresaId: string; admin: string },
): Promise<Resultado<{ urlFatura: string | null }>> {
  const empresa = await lerEmpresa(d.db, e.empresaId);
  if (!empresa) return { ok: false, erro: 'Empresa não encontrada.' };
  try {
    const cliente = await garantirCliente(d, e.empresaId, null);
    const vencimento = somarDias(hojeNoFuso(empresa.fuso, agoraDe(d)), 3);
    const p = await d.asaas.criarCobranca({
      cliente,
      valorCentavos: VALOR_IMPLANTACAO_CENTAVOS,
      vencimento,
      descricao: 'Orkestra: implantação',
      empresaId: e.empresaId,
    });
    await registrarCobrancaLida(d.db, 'implantacao', p);
    await d.db.execute(
      sql`select public.interno_registrar(${e.admin}, 'implantacao.criada', ${e.empresaId},
        ${JSON.stringify({ cobranca: p.id, vencimento })}::jsonb)`,
    );
    return { ok: true, dados: { urlFatura: p.invoiceUrl ?? null } };
  } catch (erro) {
    if (erro instanceof ErroAsaas) {
      if (erro.codigo === 'SEM_DADOS_COBRANCA') {
        return { ok: false, erro: 'A empresa ainda não preencheu os dados de cobrança.' };
      }
      return { ok: false, erro: ERRO_ASAAS, codigo: erro.codigo };
    }
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Reconciliação diária
// ---------------------------------------------------------------------------

export type ResumoReconciliacao = {
  assinaturas: number;
  cobrancas: number;
  cuponsEncerrados: number;
  falhas: number;
};

/**
 * Confere no Asaas as assinaturas não canceladas (e as canceladas há menos de 40 dias) e as
 * implantações em aberto, registra o que mudou (eventos sintéticos idempotentes) e volta ao
 * preço cheio quando o cupom acaba. Uma falha não interrompe as outras.
 */
export async function reconciliar(d: DepsCobranca): Promise<ResumoReconciliacao> {
  const agora = agoraDe(d);
  const resumo: ResumoReconciliacao = {
    assinaturas: 0,
    cobrancas: 0,
    cuponsEncerrados: 0,
    falhas: 0,
  };
  const lista = await d.db
    .select({ a: assinaturas, fuso: empresas.fuso })
    .from(assinaturas)
    .innerJoin(empresas, eq(empresas.id, assinaturas.empresaId))
    .where(
      sql`${assinaturas.asaasAssinaturaId} is not null and (${assinaturas.status} <> 'cancelada'
        or ${assinaturas.canceladaEm} > ${agora.toISOString()}::timestamptz - interval '40 days')`,
    );
  for (const { a, fuso } of lista) {
    try {
      const pagamentos = await d.asaas.cobrancasDaAssinatura(a.asaasAssinaturaId!);
      for (const p of pagamentos) {
        if ((await registrarCobrancaLida(d.db, 'reconc', p)) === 'cobranca') resumo.cobrancas++;
      }
      resumo.assinaturas++;
      const hoje = hojeNoFuso(fuso, agora);
      if (a.status !== 'cancelada' && a.cupomAte && a.cupomAte < hoje) {
        const [plano] = await d.db.select().from(planos).where(eq(planos.codigo, a.planoCodigo));
        const cheio = precoDoCiclo(plano!, a.ciclo);
        if (a.valorCentavos < cheio) {
          await d.asaas.atualizarAssinatura(a.asaasAssinaturaId!, { valorCentavos: cheio });
          await d.db.transaction(async (tx) => {
            await tx
              .update(assinaturas)
              .set({ valorCentavos: cheio })
              .where(eq(assinaturas.id, a.id));
            await auditar(tx, a.empresaId, null, 'assinatura.cupom_encerrado', a.id, {
              cupom: a.cupomCodigo,
              antes: a.valorCentavos,
              depois: cheio,
            });
          });
          resumo.cuponsEncerrados++;
        }
      }
    } catch (erro) {
      resumo.falhas++;
      console.error(
        '[cobranca] reconciliar',
        a.id,
        erro instanceof ErroAsaas ? erro.codigo : 'ERRO',
      );
    }
  }
  const avulsas = await d.db
    .select({ id: cobrancas.id, asaas: cobrancas.asaasCobrancaId })
    .from(cobrancas)
    .where(
      and(eq(cobrancas.tipo, 'implantacao'), inArray(cobrancas.status, ['pendente', 'vencida'])),
    );
  for (const c of avulsas) {
    try {
      const r = await registrarCobrancaLida(d.db, 'reconc', await d.asaas.buscarCobranca(c.asaas));
      if (r === 'cobranca') {
        resumo.cobrancas++;
      }
    } catch (erro) {
      resumo.falhas++;
      console.error(
        '[cobranca] reconciliar',
        c.id,
        erro instanceof ErroAsaas ? erro.codigo : 'ERRO',
      );
    }
  }
  await d.db.execute(sql`select public.atualizar_situacoes()`);
  return resumo;
}

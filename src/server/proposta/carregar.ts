import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { hojeNoFuso } from '@/domain/dates';
import type { ResultadoOrcamento } from '@/domain/preco';
import {
  montarConteudo,
  type BuffetProposta,
  type ConteudoCongelado,
  type ModeloProposta,
  type VersaoProposta,
} from '@/domain/proposta';
import { urlPublicaMidia } from '@/lib/midia';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { camelizar } from '@/server/catalogo/montar-contexto';
import { comAnon as comAnonPadrao } from '@/server/db/anon';
import {
  empresas,
  espacos,
  leads,
  orcamentoItens,
  orcamentos,
  tiposEvento,
  turnos,
} from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { lerBuffet, type ComAnon } from '@/server/publico/carregar';

/*
 * UM carregador da proposta para a web e para o PDF (e a variante do painel, via RLS). Os dois
 * renderizadores desenham o mesmo ModeloProposta (domain/proposta/conteudo).
 */

export type PropostaCarregada = {
  versao: VersaoProposta;
  buffet: BuffetProposta;
  modelo: ModeloProposta;
  meta: {
    token: string;
    tokenAntigo: boolean;
    atualizadaEm: string | null;
    ehTeste: boolean;
    suspenso: boolean;
    reserva: { tipo: string; status: string; expiraEm: string | null } | null;
    prazoPreReservaHoras: number;
    clientePrimeiroNome: string | null;
  };
};

type JsonProposta = {
  numero: number;
  versao: number;
  token: string;
  tokenAntigo: boolean;
  atualizadaEm: string | null;
  status: string;
  ehTeste: boolean;
  enviadoEm: string | null;
  validadeAte: string;
  hoje: string;
  totalCentavos: number;
  data: string;
  convidados: number;
  tipoEvento: string | null;
  turno: { nome: string; horaInicio: string } | null;
  espaco: string | null;
  clientePrimeiroNome: string | null;
  clienteNome: string | null;
  observacoes: string | null;
  itens: {
    tipo: string;
    descricao: string;
    quantidade: number;
    valorUnitarioCentavos: number;
    subtotalCentavos: number;
    detalhe: string | null;
  }[];
  reserva: { tipo: string; status: string; expiraEm: string | null } | null;
  suspenso: boolean;
  empresa: {
    nome: string;
    razaoSocial: string | null;
    cnpj: string | null;
    endereco: string | null;
    whatsappE164: string | null;
    rodapeOrkestra: boolean;
  };
  regras: { prazoPreReservaHoras: number; sinalBp: number; cancelamentoTexto: string | null };
};

/** Proposta pública pelo token (sempre a versão vigente). Null se não existir neste buffet. */
export async function carregarPropostaPublica(
  slug: string,
  token: string,
  comAnon: ComAnon = comAnonPadrao,
): Promise<PropostaCarregada | null> {
  let bruto: Record<string, unknown>;
  try {
    const [linha] = await comAnon((tx) =>
      tx.execute<{ p: unknown }>(sql`select publico.proposta(${slug}, ${token}) as p`),
    );
    bruto = linha!.p as Record<string, unknown>;
  } catch (erro) {
    const mensagem =
      (erro as { cause?: { message?: string } }).cause?.message ?? (erro as Error).message;
    if (mensagem === 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO') return null;
    throw erro;
  }
  // resultado e conteúdo já estão em camelCase (vêm do servidor); só o resto vem do SQL.
  const { resultado, conteudo, ...resto } = bruto;
  const p = camelizar<JsonProposta>(resto);
  const identidade = await lerBuffet(slug, comAnon);
  const buffet: BuffetProposta = {
    nome: p.empresa.nome,
    logoUrl: identidade?.logoUrl ?? null,
    corMarca: identidade?.corMarca ?? null,
    razaoSocial: p.empresa.razaoSocial,
    cnpj: p.empresa.cnpj,
    endereco: p.empresa.endereco,
    whatsappE164: p.empresa.whatsappE164,
    rodapeOrkestra: p.empresa.rodapeOrkestra,
  };
  const versao: VersaoProposta = {
    numero: p.numero,
    versao: p.versao,
    status: p.status,
    emitidaEm: p.enviadoEm,
    validadeAte: p.validadeAte,
    hoje: p.hoje,
    resultado: resultado as ResultadoOrcamento,
    conteudo: (conteudo as ConteudoCongelado | null) ?? null,
    itens: p.itens,
    totalCentavos: p.totalCentavos,
    data: p.data,
    convidados: p.convidados,
    tipoEvento: p.tipoEvento,
    turno: p.turno,
    espaco: p.espaco,
    clienteNome: p.clienteNome,
    observacoes: p.observacoes,
  };
  return {
    versao,
    buffet,
    modelo: montarConteudo(versao, buffet),
    meta: {
      token: p.token,
      tokenAntigo: p.tokenAntigo,
      atualizadaEm: p.atualizadaEm,
      ehTeste: p.ehTeste,
      suspenso: p.suspenso,
      reserva: p.reserva,
      prazoPreReservaHoras: p.regras.prazoPreReservaHoras,
      clientePrimeiroNome: p.clientePrimeiroNome,
    },
  };
}

/** Abertura pelo cliente (o servidor decide se é usuário da própria empresa). */
export async function registrarAbertura(
  slug: string,
  token: string,
  ehUsuarioEmpresa: boolean,
  ipHash: string,
  comAnon: ComAnon = comAnonPadrao,
): Promise<void> {
  try {
    await comAnon((tx) =>
      tx.execute(
        sql`select publico.registrar_abertura(${slug}, ${token}, ${ehUsuarioEmpresa}, ${ipHash})`,
      ),
    );
  } catch {
    // rastreio nunca atrapalha a proposta
  }
}

/** Qualquer versão, pelo painel (RLS: só da empresa do usuário). */
export async function carregarPropostaDoPainel(
  usuario: UsuarioAtual,
  orcamentoId: string,
): Promise<(PropostaCarregada & { slug: string }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orcamentoId)) return null;
  const linha = await comUsuario(usuario.id, async (tx) => {
    const [o] = await tx
      .select({
        o: orcamentos,
        tipoEvento: tiposEvento.nome,
        turnoNome: turnos.nome,
        turnoHora: turnos.horaInicio,
        espaco: espacos.nome,
        clienteNome: leads.nome,
        empresa: empresas,
      })
      .from(orcamentos)
      .innerJoin(empresas, eq(empresas.id, orcamentos.empresaId))
      .innerJoin(leads, eq(leads.id, orcamentos.leadId))
      .leftJoin(tiposEvento, eq(tiposEvento.id, orcamentos.tipoEventoId))
      .leftJoin(turnos, eq(turnos.id, orcamentos.turnoId))
      .leftJoin(espacos, eq(espacos.id, orcamentos.espacoId))
      .where(and(eq(orcamentos.id, orcamentoId)))
      .limit(1);
    if (!o) return null;
    const itens = await tx
      .select()
      .from(orcamentoItens)
      .where(eq(orcamentoItens.orcamentoId, orcamentoId))
      .orderBy(orcamentoItens.ordem);
    return { ...o, itens };
  });
  if (!linha || !linha.o.resultado || linha.o.status === 'em_montagem') return null;
  const { o, empresa } = linha;
  const buffet: BuffetProposta = {
    nome: empresa.nome,
    logoUrl: urlPublicaMidia(empresa.logoPath),
    corMarca: empresa.corMarca,
    razaoSocial: empresa.razaoSocial,
    cnpj: empresa.cnpj,
    endereco: empresa.endereco,
    whatsappE164: empresa.whatsappE164,
    rodapeOrkestra: empresa.rodapeOrkestra,
  };
  const versao: VersaoProposta = {
    numero: o.numero,
    versao: o.versao,
    status: o.status,
    emitidaEm: o.enviadoEm?.toISOString() ?? null,
    validadeAte: o.validadeAte ?? hojeNoFuso(empresa.fuso),
    hoje: hojeNoFuso(empresa.fuso),
    resultado: o.resultado as ResultadoOrcamento,
    conteudo: (o.conteudo as ConteudoCongelado | null) ?? null,
    itens: linha.itens.map((i) => ({
      tipo: i.tipo,
      descricao: i.descricao,
      quantidade: i.quantidade,
      subtotalCentavos: i.subtotalCentavos,
      detalhe: i.detalhe,
    })),
    totalCentavos: o.totalCentavos ?? 0,
    data: o.data ?? hojeNoFuso(empresa.fuso),
    convidados: o.convidados ?? 0,
    tipoEvento: linha.tipoEvento,
    turno: linha.turnoNome
      ? { nome: linha.turnoNome, horaInicio: linha.turnoHora!.slice(0, 5) }
      : null,
    espaco: linha.espaco,
    clienteNome: linha.clienteNome,
    observacoes: o.observacoes,
  };
  return {
    slug: empresa.slug,
    versao,
    buffet,
    modelo: montarConteudo(versao, buffet),
    meta: {
      token: o.token,
      tokenAntigo: false,
      atualizadaEm: o.enviadoEm?.toISOString() ?? null,
      ehTeste: o.ehTeste,
      suspenso: empresa.plano === 'suspenso',
      reserva: null,
      prazoPreReservaHoras: 0,
      clientePrimeiroNome: linha.clienteNome.split(' ')[0] ?? null,
    },
  };
}

import 'server-only';
import type { SituacaoMensagem } from '@/domain/leads/mensagens';
import { and, asc, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { diaDaSemana, formatData, hojeNoFuso } from '@/domain/dates';
import {
  filtrosParaSql,
  grupoDoLead,
  limitesDoDia,
  motivoPrioridade,
  rotuloMotivoPerda,
  type DadosMensagem,
  type EntradaPrioridade,
  type FiltrosCaixa,
  type GrupoPrioridade,
  type MomentoLead,
} from '@/domain/leads';
import { formatPhoneBR } from '@/domain/phone';
import { diferencasEntreVersoes, estadoValidade, type ResumoVersao } from '@/domain/proposta';
import type { StatusLead, TemperaturaLead } from '@/domain/publico/status-lead';
import type { OrigemLead } from '@/domain/publico/tipos';
import { linkWhatsApp, mensagemEnvioProposta } from '@/domain/publico/whatsapp';
import {
  carregarDisponibilidade,
  reservasAtivasDoLead,
  type ReservaAgenda,
} from '@/server/agenda/carregar';
import type { UsuarioAtual } from '@/server/auth/sessao';
import {
  atividades,
  espacos,
  leads,
  notas,
  orcamentoItens,
  orcamentos,
  reservas,
  tarefas,
  tiposEvento,
  turnos,
  usuarios,
  visitas,
} from '@/server/db/schema';
import { comUsuario, naTransacao, type Tx } from '@/server/db/tenant';
import { automaticaDaTarefa } from '@/server/tarefas/automatica';
import { urlDoSite } from '@/server/env';

/*
 * Leituras de Leads (dono e vendedor), sempre pelo RLS. A caixa usa public.caixa_leads (uma
 * consulta por página, com grupo e ordem calculados no banco); o motivo legível do cartão vem do
 * domínio (domain/leads/prioridade). Telefones já saem formatados: o navegador não carrega a
 * biblioteca de telefone.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDEM = /^-?\d{1,19}$/;

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return (
    (partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

/** "Infantil · sáb 14/11 · Tarde · 60 pessoas" (só o que existir). */
export function resumoFestaCartao(f: {
  tipo: string | null;
  data: string | null;
  turno: string | null;
  convidados: number | null;
}): string {
  return [
    f.tipo,
    f.data ? `${diaDaSemana(f.data).slice(0, 3)} ${formatData(f.data).slice(0, 5)}` : null,
    f.turno,
    f.convidados ? `${f.convidados} pessoas` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Caixa
// ---------------------------------------------------------------------------
/** `o` é a chave de ordem em microssegundos (bigint do banco), como texto: nada de float. */
export type CursorCaixa = { g: number; o: string; id: string } | null;

export type CartaoLead = {
  id: string;
  nome: string;
  telefone: string;
  whatsappE164: string;
  status: StatusLead;
  temperatura: TemperaturaLead;
  origem: OrigemLead;
  ehTeste: boolean;
  responsavel: { id: string; nome: string; iniciais: string } | null;
  grupo: GrupoPrioridade;
  motivo: string;
  festa: string;
  totalCentavos: number | null;
  temAtrasada: boolean;
};

export type PaginaCaixa = { cartoes: CartaoLead[]; cursor: CursorCaixa };

type LinhaCaixa = {
  id: string;
  nome: string;
  whatsapp_e164: string;
  status: StatusLead;
  temperatura: TemperaturaLead;
  origem: OrigemLead;
  eh_teste: boolean;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  criado_em: Date;
  ultima_atividade_em: Date;
  primeiro_contato_em: Date | null;
  proximo_contato_em: Date | null;
  grupo: number;
  /** bigint: o postgres.js entrega como texto */
  ordem: string;
  pre_reserva_expira_em: Date | null;
  visita_pedida: boolean;
  visita_pedida_em: Date | null;
  visita_proxima: Date | null;
  tarefa_vence: Date | null;
  tem_atrasada: boolean;
  aberturas: number;
  total_centavos: number | null;
  evento_data: string | Date | null;
  evento_tipo: string | null;
  evento_turno: string | null;
  evento_convidados: number | null;
};

const dataCivil = (v: string | Date | null) =>
  v === null ? null : typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
const instante = (v: Date | string | null) => (v === null ? null : new Date(v));

export async function listarCaixa(
  usuario: UsuarioAtual,
  filtros: FiltrosCaixa,
  cursor: CursorCaixa = null,
  limite = 30,
  tx?: Tx,
): Promise<PaginaCaixa> {
  const cursorValido =
    cursor && Number.isInteger(cursor.g) && ORDEM.test(cursor.o) && UUID.test(cursor.id)
      ? cursor
      : null;
  const linhas = await naTransacao(usuario.id, tx, (tx) =>
    tx.execute<LinhaCaixa>(sql`select * from public.caixa_leads(
      ${JSON.stringify(filtrosParaSql(filtros))}::jsonb,
      ${cursorValido ? JSON.stringify(cursorValido) : null}::jsonb, ${limite + 1})`),
  );
  const agora = new Date();
  const fuso = usuario.empresa.fuso;
  const pagina = linhas.slice(0, limite);
  const cartoes = pagina.map((r): CartaoLead => {
    const e: EntradaPrioridade = {
      status: r.status,
      temperatura: r.temperatura,
      preReservaExpiraEm: instante(r.pre_reserva_expira_em),
      visitaPedida: r.visita_pedida,
      visitaPedidaEm: instante(r.visita_pedida_em),
      visitaProxima: instante(r.visita_proxima),
      tarefaVence: instante(r.tarefa_vence),
      primeiroContatoEm: instante(r.primeiro_contato_em),
      proximoContatoEm: instante(r.proximo_contato_em),
      criadoEm: new Date(r.criado_em),
      ultimaAtividadeEm: new Date(r.ultima_atividade_em),
      aberturas: Number(r.aberturas ?? 0),
    };
    const grupo = r.grupo as GrupoPrioridade;
    return {
      id: r.id,
      nome: r.nome,
      telefone: formatPhoneBR(r.whatsapp_e164),
      whatsappE164: r.whatsapp_e164,
      status: r.status,
      temperatura: r.temperatura,
      origem: r.origem,
      ehTeste: r.eh_teste,
      responsavel:
        r.responsavel_id && r.responsavel_nome
          ? {
              id: r.responsavel_id,
              nome: r.responsavel_nome,
              iniciais: iniciais(r.responsavel_nome),
            }
          : null,
      grupo,
      motivo: motivoPrioridade(grupo, e, agora, fuso),
      festa: resumoFestaCartao({
        tipo: r.evento_tipo,
        data: dataCivil(r.evento_data),
        turno: r.evento_turno,
        convidados: r.evento_convidados,
      }),
      totalCentavos: r.total_centavos,
      temAtrasada: r.tem_atrasada,
    };
  });
  const ultimo = pagina.at(-1);
  return {
    cartoes,
    cursor:
      linhas.length > limite && ultimo
        ? { g: ultimo.grupo, o: String(ultimo.ordem), id: ultimo.id }
        : null,
  };
}

export type ResumoHoje = {
  preReservas: number;
  visitas: number;
  tarefasHoje: number;
  atrasadas: number;
  novos: number;
  pedemAcao: number;
};

export async function resumoHoje(usuario: UsuarioAtual, tx?: Tx): Promise<ResumoHoje> {
  const [r] = await naTransacao(usuario.id, tx, (tx) =>
    tx.execute<Record<string, number>>(sql`select * from public.resumo_hoje()`),
  );
  return resumoDaLinha(r);
}

/** Linha de public.resumo_hoje() → ResumoHoje. Também usada pelo contexto do painel. */
export function resumoDaLinha(r: Record<string, unknown> | undefined): ResumoHoje {
  return {
    preReservas: Number(r?.pre_reservas ?? 0),
    visitas: Number(r?.visitas ?? 0),
    tarefasHoje: Number(r?.tarefas_hoje ?? 0),
    atrasadas: Number(r?.atrasadas ?? 0),
    novos: Number(r?.novos ?? 0),
    pedemAcao: Number(r?.pedem_acao ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Detalhe do lead
// ---------------------------------------------------------------------------
export type ResumoOrcamento = {
  id: string;
  numero: number;
  versao: number;
  token: string;
  canal: string;
  aberturas: number;
  ehTeste: boolean;
  status: string;
  tipoEvento: string | null;
  data: string | null;
  turno: string | null;
  espaco: string | null;
  convidados: number | null;
  totalCentavos: number | null;
  validadeAte: string | null;
  criadoEm: string;
};

export type VersaoDoLead = ResumoOrcamento & {
  itens: { descricao: string; detalhe: string | null; subtotalCentavos: number }[];
  /** o que mudou em relação à versão anterior */
  diferencas: string[];
  validade: { expirada: boolean; texto: string } | null;
  link: string;
  /** null quando o lead foi anonimizado (sem WhatsApp) */
  linkWhatsapp: string | null;
};

export type GrupoOrcamento = { numero: number; versoes: VersaoDoLead[] };

export type TarefaDoLead = {
  id: string;
  titulo: string;
  descricao: string | null;
  venceEm: string;
  atrasada: boolean;
  feitaEm: string | null;
  responsavelNome: string | null;
  mensagemSugerida: string | null;
  regra: string | null;
  /** tarefa automática (Etapa 7): situação da mensagem pronta e o motivo do selo */
  automatica: { situacao: SituacaoMensagem; motivo: string } | null;
};

export type VisitaDoLead = {
  id: string;
  status: string;
  dataPreferida: string;
  periodo: string;
  dataHora: string | null;
  observacoes: string | null;
  motivoCancelamento: string | null;
};

export type NotaDoLead = {
  id: string;
  texto: string;
  autorNome: string | null;
  criadoEm: string;
  editadoEm: string | null;
  podeEditar: boolean;
  podeApagar: boolean;
};

export type AtividadeDoLead = {
  id: string;
  tipo: string;
  dados: Record<string, unknown>;
  autor: string;
  /** nome de quem fez, quando foi alguém da equipe */
  quem: string | null;
  criadoEm: string;
};

export type DetalheLead = {
  id: string;
  nome: string;
  /** null depois da anonimização (LGPD) */
  whatsappE164: string | null;
  anonimizadoEm: string | null;
  telefone: string;
  email: string | null;
  status: StatusLead;
  temperatura: TemperaturaLead;
  origem: OrigemLead;
  ehTeste: boolean;
  consentimentoEm: string | null;
  criadoEm: string;
  ultimaAtividadeEm: string;
  primeiroContatoEm: string | null;
  proximoContatoEm: string | null;
  responsavel: { id: string; nome: string } | null;
  perda: { codigo: string; rotulo: string; detalhe: string | null; em: string | null } | null;
  /** um grupo por número; versões da mais nova para a mais antiga (a primeira é a vigente) */
  orcamentos: GrupoOrcamento[];
  visitas: VisitaDoLead[];
  tarefas: TarefaDoLead[];
  notas: NotaDoLead[];
  reservas: ReservaAgenda[];
  atividades: AtividadeDoLead[];
  /** usuários ativos da empresa (atribuir responsável) */
  usuarios: { id: string; nome: string }[];
};

async function resumosDosOrcamentos(tx: Tx, leadId: string): Promise<ResumoOrcamento[]> {
  const linhas = await tx
    .select({
      o: orcamentos,
      tipoEvento: tiposEvento.nome,
      turno: turnos.nome,
      espaco: espacos.nome,
    })
    .from(orcamentos)
    .leftJoin(tiposEvento, eq(tiposEvento.id, orcamentos.tipoEventoId))
    .leftJoin(turnos, eq(turnos.id, orcamentos.turnoId))
    .leftJoin(espacos, eq(espacos.id, orcamentos.espacoId))
    .where(eq(orcamentos.leadId, leadId))
    .orderBy(desc(orcamentos.criadoEm), desc(orcamentos.numero), desc(orcamentos.versao));
  return linhas.map(({ o, tipoEvento, turno, espaco }) => ({
    id: o.id,
    numero: o.numero,
    versao: o.versao,
    token: o.token,
    canal: o.canal,
    aberturas: o.aberturas,
    ehTeste: o.ehTeste,
    status: o.status,
    tipoEvento,
    data: o.data,
    turno,
    espaco,
    convidados: o.convidados,
    totalCentavos: o.totalCentavos,
    validadeAte: o.validadeAte,
    criadoEm: o.criadoEm.toISOString(),
  }));
}

export async function carregarLead(usuario: UsuarioAtual, id: string): Promise<DetalheLead | null> {
  if (!UUID.test(id)) return null;
  // tudo numa leva só (pipeline): as consultas dependem do id, não da linha do lead
  const dados = await comUsuario(usuario.id, async (tx) => {
    const [
      [l],
      resumos,
      itens,
      listaVisitas,
      listaTarefas,
      listaNotas,
      listaAtividades,
      equipe,
      reservasDoLead,
    ] = await Promise.all([
      tx
        .select({ l: leads, responsavelNome: usuarios.nome })
        .from(leads)
        .leftJoin(usuarios, eq(usuarios.id, leads.responsavelId))
        .where(eq(leads.id, id))
        .limit(1),
      resumosDosOrcamentos(tx, id),
      tx
        .select({
          orcamentoId: orcamentoItens.orcamentoId,
          tipo: orcamentoItens.tipo,
          descricao: orcamentoItens.descricao,
          detalhe: orcamentoItens.detalhe,
          subtotalCentavos: orcamentoItens.subtotalCentavos,
        })
        .from(orcamentoItens)
        .innerJoin(orcamentos, eq(orcamentos.id, orcamentoItens.orcamentoId))
        .where(eq(orcamentos.leadId, id))
        .orderBy(asc(orcamentoItens.ordem)),
      tx.select().from(visitas).where(eq(visitas.leadId, id)).orderBy(desc(visitas.criadoEm)),
      tx
        .select({ t: tarefas, responsavelNome: usuarios.nome })
        .from(tarefas)
        .leftJoin(usuarios, eq(usuarios.id, tarefas.responsavelId))
        .where(
          and(
            eq(tarefas.leadId, id),
            isNull(tarefas.canceladaEm),
            or(isNull(tarefas.feitaEm), gt(tarefas.feitaEm, sql`now() - interval '7 days'`)),
          ),
        )
        .orderBy(asc(tarefas.venceEfetivo)),
      tx
        .select({ n: notas, autorNome: usuarios.nome })
        .from(notas)
        .leftJoin(usuarios, eq(usuarios.id, notas.autorId))
        .where(eq(notas.leadId, id))
        .orderBy(desc(notas.criadoEm)),
      tx
        .select({ a: atividades, quem: usuarios.nome })
        .from(atividades)
        .leftJoin(usuarios, eq(usuarios.id, atividades.usuarioId))
        .where(eq(atividades.leadId, id))
        .orderBy(desc(atividades.criadoEm))
        .limit(200),
      tx
        .select({ id: usuarios.id, nome: usuarios.nome })
        .from(usuarios)
        .where(eq(usuarios.ativo, true))
        .orderBy(asc(usuarios.nome)),
      reservasAtivasDoLead(usuario, id, tx),
    ]);
    if (!l) return null;
    return {
      l,
      resumos,
      itens,
      listaVisitas,
      listaTarefas,
      listaNotas,
      listaAtividades,
      equipe,
      reservasDoLead,
    };
  });
  if (!dados) return null;
  const {
    l: linha,
    resumos,
    itens,
    listaVisitas,
    listaTarefas,
    listaNotas,
    listaAtividades,
    equipe,
    reservasDoLead,
  } = dados;
  const l = linha.l;

  const agora = Date.now();
  const hoje = hojeNoFuso(usuario.empresa.fuso);
  const site = urlDoSite() ?? '';
  const itensDe = (oid: string) => itens.filter((i) => i.orcamentoId === oid);
  const resumoVersao = (o: ResumoOrcamento): ResumoVersao => ({
    data: o.data,
    turno: o.turno,
    espaco: o.espaco,
    convidados: o.convidados,
    pacote: itensDe(o.id).find((i) => i.tipo === 'pacote')?.descricao ?? null,
    extras: itensDe(o.id)
      .filter((i) => i.tipo === 'opcional')
      .map((i) => i.descricao),
    totalCentavos: o.totalCentavos,
  });
  const grupos = new Map<number, ResumoOrcamento[]>();
  for (const r of resumos) {
    if (r.status === 'em_montagem') continue;
    grupos.set(r.numero, [...(grupos.get(r.numero) ?? []), r]);
  }
  const dono = usuario.perfil === 'dono';

  return {
    id: l.id,
    nome: l.nome,
    whatsappE164: l.whatsappE164,
    telefone: l.whatsappE164 ? formatPhoneBR(l.whatsappE164) : '',
    anonimizadoEm: l.anonimizadoEm?.toISOString() ?? null,
    email: l.email,
    status: l.status,
    temperatura: l.temperatura,
    origem: l.origem,
    ehTeste: l.ehTeste,
    consentimentoEm: l.consentimentoEm?.toISOString() ?? null,
    criadoEm: l.criadoEm.toISOString(),
    ultimaAtividadeEm: l.ultimaAtividadeEm.toISOString(),
    primeiroContatoEm: l.primeiroContatoEm?.toISOString() ?? null,
    proximoContatoEm: l.proximoContatoEm?.toISOString() ?? null,
    responsavel:
      l.responsavelId && linha.responsavelNome
        ? { id: l.responsavelId, nome: linha.responsavelNome }
        : null,
    perda:
      l.status === 'perdido' && l.motivoPerdaCodigo
        ? {
            codigo: l.motivoPerdaCodigo,
            rotulo: rotuloMotivoPerda(l.motivoPerdaCodigo) ?? '',
            detalhe: l.motivoPerda,
            em: l.perdidoEm?.toISOString() ?? null,
          }
        : null,
    orcamentos: [...grupos.entries()].map(([numero, lista]) => {
      const versoes = [...lista].sort((a, b) => b.versao - a.versao);
      return {
        numero,
        versoes: versoes.map((o, i) => {
          const anterior = versoes[i + 1];
          const link = `${site}/b/${usuario.empresa.slug}/proposta/${o.token}`;
          return {
            ...o,
            itens: itensDe(o.id).map(({ descricao, detalhe, subtotalCentavos }) => ({
              descricao,
              detalhe,
              subtotalCentavos,
            })),
            diferencas: anterior
              ? diferencasEntreVersoes(resumoVersao(anterior), resumoVersao(o))
              : [],
            validade: o.validadeAte ? estadoValidade(o.validadeAte, hoje) : null,
            link,
            linkWhatsapp: l.whatsappE164
              ? linkWhatsApp(
                  l.whatsappE164,
                  mensagemEnvioProposta(usuario.empresa.nome, l.nome, link),
                )
              : null,
          };
        }),
      };
    }),
    visitas: listaVisitas.map((v) => ({
      id: v.id,
      status: v.status,
      dataPreferida: v.dataPreferida,
      periodo: v.periodo,
      dataHora: v.dataHora?.toISOString() ?? null,
      observacoes: v.observacoes,
      motivoCancelamento: v.motivoCancelamento,
    })),
    tarefas: listaTarefas.map(({ t, responsavelNome }) => {
      const vence = t.venceEfetivo ?? t.adiadaPara ?? t.venceEm;
      return {
        id: t.id,
        titulo: t.titulo,
        descricao: t.descricao,
        venceEm: vence.toISOString(),
        atrasada: !t.feitaEm && vence.getTime() < agora,
        feitaEm: t.feitaEm?.toISOString() ?? null,
        responsavelNome,
        mensagemSugerida: t.mensagemSugerida,
        regra: t.regra,
        automatica: automaticaDaTarefa(t.origem, t.regra, t.mensagemDados),
      };
    }),
    notas: listaNotas.map(({ n, autorNome }) => {
      const recente = agora - n.criadoEm.getTime() < 24 * 3_600_000;
      const minha = n.autorId === usuario.id;
      return {
        id: n.id,
        texto: n.texto,
        autorNome,
        criadoEm: n.criadoEm.toISOString(),
        editadoEm: n.editadoEm?.toISOString() ?? null,
        podeEditar: minha && recente,
        podeApagar: dono || (minha && recente),
      };
    }),
    reservas: reservasDoLead,
    atividades: listaAtividades.map(({ a, quem }) => ({
      id: a.id,
      tipo: a.tipo,
      dados: (a.dados ?? {}) as Record<string, unknown>,
      autor: a.autor,
      quem: a.autor === 'usuario' ? quem : null,
      criadoEm: a.criadoEm.toISOString(),
    })),
    usuarios: equipe,
  };
}

// ---------------------------------------------------------------------------
// Dados para a mensagem pronta
// ---------------------------------------------------------------------------
export async function dadosDaMensagem(
  usuario: UsuarioAtual,
  leadId: string,
): Promise<{ whatsappE164: string; momento: MomentoLead; dados: DadosMensagem } | null> {
  const r = await comUsuario(usuario.id, async (tx) => {
    const [l] = await tx.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!l) return null;
    const [o] = await tx
      .select({ o: orcamentos, tipo: tiposEvento.nome })
      .from(orcamentos)
      .leftJoin(tiposEvento, eq(tiposEvento.id, orcamentos.tipoEventoId))
      .where(
        and(
          eq(orcamentos.leadId, leadId),
          sql`${orcamentos.status} not in ('substituido', 'em_montagem')`,
        ),
      )
      .orderBy(desc(orcamentos.criadoEm))
      .limit(1);
    const [pre] = await tx
      .select({ expira: reservas.expiraEm })
      .from(reservas)
      .where(
        and(
          eq(reservas.leadId, leadId),
          eq(reservas.status, 'ativa'),
          eq(reservas.tipo, 'pre_reserva'),
          gt(reservas.expiraEm, sql`now()`),
        ),
      )
      .limit(1);
    const [visita] = await tx
      .select({ dataHora: visitas.dataHora })
      .from(visitas)
      .where(
        and(
          eq(visitas.leadId, leadId),
          eq(visitas.status, 'confirmada'),
          gt(visitas.dataHora, sql`now() - interval '3 hours'`),
        ),
      )
      .orderBy(asc(visitas.dataHora))
      .limit(1);
    return { l, o, pre, visita };
  });
  if (!r) return null;
  const { l, o, pre, visita } = r;
  // lead anonimizado (LGPD): não há para quem mandar mensagem
  if (!l.whatsappE164) return null;
  const whatsappE164 = l.whatsappE164;
  const orc = o?.o ?? null;
  const resultado = (orc?.resultado ?? null) as { sinalCentavos?: number } | null;

  // A data só é citada para lead frio se ainda estiver livre de verdade na agenda.
  let dataAindaLivre = false;
  if (orc?.data && orc.turnoId && orc.espacoId && orc.data >= hojeNoFuso(usuario.empresa.fuso)) {
    const slots = await carregarDisponibilidade(usuario, orc.data, orc.data, orc.espacoId);
    dataAindaLivre = slots.some((s) => s.turnoId === orc.turnoId && s.estado === 'livre');
  }

  return {
    whatsappE164,
    momento: {
      status: l.status,
      temperatura: l.temperatura,
      preReservaAtiva: !!pre,
      visitaConfirmada: !!visita,
      aberturas: orc?.aberturas ?? 0,
      temOrcamento: !!orc,
    },
    dados: {
      nome: l.nome,
      buffet: usuario.empresa.nome,
      vendedor: usuario.nome,
      tipoFesta: o?.tipo ?? null,
      dataFesta: orc?.data ?? null,
      linkProposta: orc
        ? `${urlDoSite() ?? ''}/b/${usuario.empresa.slug}/proposta/${orc.token}`
        : null,
      preReservaExpiraEm: pre?.expira ?? null,
      sinalCentavos: resultado?.sinalCentavos ?? null,
      visitaEm: visita?.dataHora ?? null,
      dataAindaLivre,
      validadeAte: orc?.validadeAte ?? null,
      fuso: usuario.empresa.fuso,
    },
  };
}

// ---------------------------------------------------------------------------
// Grupo e motivo para um lead só (cabeçalho do detalhe)
// ---------------------------------------------------------------------------
export function prioridadeDoDetalhe(d: DetalheLead, usuario: UsuarioAtual) {
  const agora = new Date();
  const pre = d.reservas.find((r) => r.tipo === 'pre_reserva' && r.expiraEm);
  const visitaProxima = d.visitas
    .filter((v) => v.status === 'confirmada' && v.dataHora)
    .map((v) => new Date(v.dataHora!))
    .filter((x) => x.getTime() >= agora.getTime() - 3 * 3_600_000)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const tarefa = d.tarefas.find((t) => !t.feitaEm);
  const e: EntradaPrioridade = {
    status: d.status,
    temperatura: d.temperatura,
    preReservaExpiraEm: pre?.expiraEm ? new Date(pre.expiraEm) : null,
    visitaPedida: d.visitas.some((v) => v.status === 'solicitada'),
    visitaProxima: visitaProxima ?? null,
    tarefaVence: tarefa ? new Date(tarefa.venceEm) : null,
    primeiroContatoEm: d.primeiroContatoEm ? new Date(d.primeiroContatoEm) : null,
    proximoContatoEm: d.proximoContatoEm ? new Date(d.proximoContatoEm) : null,
    criadoEm: new Date(d.criadoEm),
    ultimaAtividadeEm: new Date(d.ultimaAtividadeEm),
    aberturas: d.orcamentos[0]?.versoes[0]?.aberturas ?? 0,
  };
  const g = grupoDoLead(e, agora, limitesDoDia(agora, usuario.empresa.fuso));
  return { grupo: g, motivo: motivoPrioridade(g, e, agora, usuario.empresa.fuso) };
}

/** Usuários ativos da empresa (filtro de responsável e "Atribuir"). */
export async function usuariosDaEmpresa(usuario: UsuarioAtual, tx?: Tx) {
  return naTransacao(usuario.id, tx, (tx) =>
    tx
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(eq(usuarios.ativo, true))
      .orderBy(asc(usuarios.nome)),
  );
}

import 'server-only';
import { formatPhoneBR } from '@/domain/phone';
import { and, asc, between, eq, gt, isNotNull, lte, or, sql } from 'drizzle-orm';
import type { EstadoSlot, StatusReserva, TipoReserva } from '@/domain/agenda';
import type { StatusContrato } from '@/domain/contratos/estados';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { bloqueios, espacos, leads, reservas, tiposEvento, turnos } from '@/server/db/schema';
import { comUsuario, naTransacao, type Tx } from '@/server/db/tenant';

/*
 * Leituras da agenda (sempre pelo RLS). Tudo serializável: datas civis "yyyy-MM-dd" e
 * instantes em ISO, para ir direto para componentes de cliente.
 */

export type EspacoAgenda = { id: string; nome: string; eventosSimultaneos: number };
export type TurnoAgenda = {
  id: string;
  nome: string;
  horaInicio: string;
  duracaoMin: number;
  diasSemana: number[];
};
export type BaseAgenda = {
  espacos: EspacoAgenda[];
  turnos: TurnoAgenda[];
  tiposEvento: { id: string; nome: string }[];
};

export type SlotAgenda = {
  data: string;
  turnoId: string;
  espacoId: string;
  estado: EstadoSlot;
  vagas: number;
  capacidade: number;
  expiraEm: string | null;
};

export type ReservaAgenda = {
  id: string;
  data: string;
  turnoId: string;
  espacoId: string;
  tipo: TipoReserva;
  status: StatusReserva;
  inicio: string;
  expiraEm: string | null;
  clienteNome: string;
  clienteWhatsapp: string | null;
  /** WhatsApp já formatado (o navegador não carrega a biblioteca de telefone) */
  clienteTelefone: string | null;
  tipoEventoNome: string | null;
  convidados: number | null;
  valorTotalCentavos: number | null;
  sinalCentavos: number | null;
  sinalPagoEm: string | null;
  observacoes: string | null;
  /** veio do link público (pré-reserva pelo cliente) */
  veioDoLink: boolean;
  leadNome: string | null;
  /** lead ligado à reserva (abre o detalhe do lead) */
  leadId: string | null;
  /** Etapa 10: status do contrato mais recente da reserva (ou do orçamento dela) */
  contratoStatus: StatusContrato | null;
};

export type BloqueioAgenda = {
  id: string;
  data: string;
  turnoId: string | null;
  espacoId: string | null;
  motivo: string | null;
};

export type DiaAgenda = {
  data: string;
  slots: SlotAgenda[];
  reservas: ReservaAgenda[];
  bloqueios: BloqueioAgenda[];
};

/** Normaliza instantes vindos de SQL cru (Date ou texto do Postgres) para ISO. */
function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  const texto = String(v)
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  return new Date(texto).toISOString();
}

function dataCivil(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

export async function carregarBase(usuario: UsuarioAtual, tx?: Tx): Promise<BaseAgenda> {
  return naTransacao(usuario.id, tx, async (tx) => {
    const [listaEspacos, listaTurnos, listaTipos] = await Promise.all([
      tx
        .select({
          id: espacos.id,
          nome: espacos.nome,
          eventosSimultaneos: espacos.eventosSimultaneos,
        })
        .from(espacos)
        .where(eq(espacos.ativo, true))
        .orderBy(asc(espacos.ordem), asc(espacos.nome)),
      tx
        .select({
          id: turnos.id,
          nome: turnos.nome,
          horaInicio: turnos.horaInicio,
          duracaoMin: turnos.duracaoMin,
          diasSemana: turnos.diasSemana,
        })
        .from(turnos)
        .where(eq(turnos.ativo, true))
        .orderBy(asc(turnos.horaInicio)),
      tx
        .select({ id: tiposEvento.id, nome: tiposEvento.nome })
        .from(tiposEvento)
        .where(eq(tiposEvento.ativo, true))
        .orderBy(asc(tiposEvento.ordem), asc(tiposEvento.nome)),
    ]);
    return {
      espacos: listaEspacos,
      turnos: listaTurnos.map((t) => ({ ...t, horaInicio: t.horaInicio.slice(0, 5) })),
      tiposEvento: listaTipos,
    };
  });
}

async function disponibilidadeTx(
  tx: Tx,
  empresaId: string,
  de: string,
  ate: string,
  espacoId: string | null,
): Promise<SlotAgenda[]> {
  const linhas = await tx.execute<Record<string, unknown>>(
    sql`select * from public.disponibilidade(${empresaId}::uuid, ${de}::date, ${ate}::date, ${espacoId}::uuid)`,
  );
  return linhas.map((l) => ({
    data: dataCivil(l.data),
    turnoId: String(l.turno_id),
    espacoId: String(l.espaco_id),
    estado: l.estado as EstadoSlot,
    vagas: Number(l.vagas),
    capacidade: Number(l.capacidade),
    expiraEm: iso(l.expira_em),
  }));
}

export async function carregarDisponibilidade(
  usuario: UsuarioAtual,
  de: string,
  ate: string,
  espacoId: string | null = null,
  tx?: Tx,
): Promise<SlotAgenda[]> {
  return naTransacao(usuario.id, tx, (tx) =>
    disponibilidadeTx(tx, usuario.empresa.id, de, ate, espacoId),
  );
}

/** Reservas que ocupam hoje (confirmadas ou pré-reservas não vencidas). */
const ocupando = () =>
  and(
    eq(reservas.status, 'ativa'),
    or(eq(reservas.tipo, 'confirmada'), gt(reservas.expiraEm, sql`now()`)),
  );

async function reservasTx(tx: Tx, filtro: ReturnType<typeof and>): Promise<ReservaAgenda[]> {
  const linhas = await tx
    .select({
      r: reservas,
      tipoEventoNome: tiposEvento.nome,
      leadNome: leads.nome,
      // função da empresa do usuário (o vendedor vê só o status, não o contrato)
      contratoStatus: sql<StatusContrato | null>`public.status_contrato_da_reserva(${reservas.id}, ${reservas.orcamentoId})`,
    })
    .from(reservas)
    .leftJoin(tiposEvento, eq(tiposEvento.id, reservas.tipoEventoId))
    .leftJoin(leads, eq(leads.id, reservas.leadId))
    .where(and(ocupando(), filtro))
    .orderBy(asc(reservas.inicio));
  return linhas.map(({ r, tipoEventoNome, leadNome, contratoStatus }) => ({
    id: r.id,
    data: r.data,
    turnoId: r.turnoId,
    espacoId: r.espacoId,
    tipo: r.tipo,
    status: r.status,
    inicio: r.inicio.toISOString(),
    expiraEm: r.expiraEm?.toISOString() ?? null,
    clienteNome: r.clienteNome,
    clienteWhatsapp: r.clienteWhatsappE164,
    clienteTelefone: r.clienteWhatsappE164 ? formatPhoneBR(r.clienteWhatsappE164) : null,
    tipoEventoNome,
    convidados: r.convidados,
    valorTotalCentavos: r.valorTotalCentavos,
    sinalCentavos: r.sinalCentavos,
    sinalPagoEm: r.sinalPagoEm,
    observacoes: r.observacoes,
    veioDoLink: r.origem === 'link_publico',
    leadNome,
    leadId: r.leadId,
    contratoStatus,
  }));
}

async function bloqueiosTx(tx: Tx, de: string, ate: string): Promise<BloqueioAgenda[]> {
  return tx
    .select({
      id: bloqueios.id,
      data: bloqueios.data,
      turnoId: bloqueios.turnoId,
      espacoId: bloqueios.espacoId,
      motivo: bloqueios.motivo,
    })
    .from(bloqueios)
    .where(between(bloqueios.data, de, ate))
    .orderBy(asc(bloqueios.data));
}

/** Reserva ou pré-reserva que ocupa a agenda hoje, ligada ao lead (detalhe do lead). */
export async function reservasAtivasDoLead(
  usuario: UsuarioAtual,
  leadId: string,
  tx?: Tx,
): Promise<ReservaAgenda[]> {
  return naTransacao(usuario.id, tx, (tx) => reservasTx(tx, eq(reservas.leadId, leadId)));
}

/** Reservas e bloqueios de um período (lista do celular). */
export async function carregarPeriodo(usuario: UsuarioAtual, de: string, ate: string, tx?: Tx) {
  return naTransacao(usuario.id, tx, async (tx) => {
    const [lista, bloq] = await Promise.all([
      reservasTx(tx, between(reservas.data, de, ate)),
      bloqueiosTx(tx, de, ate),
    ]);
    return { reservas: lista, bloqueios: bloq };
  });
}

/** Pré-reservas que vencem nas próximas `horas` horas (aviso no topo da agenda). */
export async function preReservasVencendo(
  usuario: UsuarioAtual,
  horas = 12,
  tx?: Tx,
): Promise<ReservaAgenda[]> {
  return naTransacao(usuario.id, tx, (tx) =>
    reservasTx(
      tx,
      and(
        eq(reservas.tipo, 'pre_reserva'),
        isNotNull(reservas.expiraEm),
        lte(reservas.expiraEm, sql`now() + make_interval(hours => ${horas})`),
      ),
    ),
  );
}

export async function carregarDia(usuario: UsuarioAtual, data: string): Promise<DiaAgenda> {
  return comUsuario(usuario.id, async (tx) => {
    const [slots, lista, bloq] = await Promise.all([
      disponibilidadeTx(tx, usuario.empresa.id, data, data, null),
      reservasTx(tx, eq(reservas.data, data)),
      bloqueiosTx(tx, data, data),
    ]);
    return { data, slots, reservas: lista, bloqueios: bloq };
  });
}

/**
 * Tudo da tela da Agenda numa transação (uma leva em pipeline). A disponibilidade vem de todos
 * os espaços; a página filtra pelo espaço escolhido (que depende da base).
 */
export async function carregarTelaAgenda(
  usuario: UsuarioAtual,
  mes: { de: string; ate: string },
  lista: { de: string; ate: string },
) {
  return comUsuario(usuario.id, async (tx) => {
    const [base, disponibilidade, periodo, vencendo] = await Promise.all([
      carregarBase(usuario, tx),
      carregarDisponibilidade(usuario, mes.de, mes.ate, null, tx),
      carregarPeriodo(usuario, lista.de, lista.ate, tx),
      preReservasVencendo(usuario, 12, tx),
    ]);
    return { base, disponibilidade, lista: periodo, vencendo };
  });
}

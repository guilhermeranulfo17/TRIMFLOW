import 'server-only';
import { and, asc, between, eq, gt, isNotNull, lte, or, sql } from 'drizzle-orm';
import type { EstadoSlot, StatusReserva, TipoReserva } from '@/domain/agenda';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { bloqueios, espacos, reservas, tiposEvento, turnos } from '@/server/db/schema';
import { comUsuario, type Tx } from '@/server/db/tenant';

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
  tipoEventoNome: string | null;
  convidados: number | null;
  valorTotalCentavos: number | null;
  sinalCentavos: number | null;
  sinalPagoEm: string | null;
  observacoes: string | null;
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

export async function carregarBase(usuario: UsuarioAtual): Promise<BaseAgenda> {
  return comUsuario(usuario.id, async (tx) => ({
    espacos: await tx
      .select({
        id: espacos.id,
        nome: espacos.nome,
        eventosSimultaneos: espacos.eventosSimultaneos,
      })
      .from(espacos)
      .where(eq(espacos.ativo, true))
      .orderBy(asc(espacos.ordem), asc(espacos.nome)),
    turnos: (
      await tx
        .select({
          id: turnos.id,
          nome: turnos.nome,
          horaInicio: turnos.horaInicio,
          duracaoMin: turnos.duracaoMin,
          diasSemana: turnos.diasSemana,
        })
        .from(turnos)
        .where(eq(turnos.ativo, true))
        .orderBy(asc(turnos.horaInicio))
    ).map((t) => ({ ...t, horaInicio: t.horaInicio.slice(0, 5) })),
    tiposEvento: await tx
      .select({ id: tiposEvento.id, nome: tiposEvento.nome })
      .from(tiposEvento)
      .where(eq(tiposEvento.ativo, true))
      .orderBy(asc(tiposEvento.ordem), asc(tiposEvento.nome)),
  }));
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
): Promise<SlotAgenda[]> {
  return comUsuario(usuario.id, (tx) =>
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
    })
    .from(reservas)
    .leftJoin(tiposEvento, eq(tiposEvento.id, reservas.tipoEventoId))
    .where(and(ocupando(), filtro))
    .orderBy(asc(reservas.inicio));
  return linhas.map(({ r, tipoEventoNome }) => ({
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
    tipoEventoNome,
    convidados: r.convidados,
    valorTotalCentavos: r.valorTotalCentavos,
    sinalCentavos: r.sinalCentavos,
    sinalPagoEm: r.sinalPagoEm,
    observacoes: r.observacoes,
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

/** Reservas e bloqueios de um período (lista do celular). */
export async function carregarPeriodo(usuario: UsuarioAtual, de: string, ate: string) {
  return comUsuario(usuario.id, async (tx) => ({
    reservas: await reservasTx(tx, between(reservas.data, de, ate)),
    bloqueios: await bloqueiosTx(tx, de, ate),
  }));
}

/** Pré-reservas que vencem nas próximas `horas` horas (aviso no topo da agenda). */
export async function preReservasVencendo(
  usuario: UsuarioAtual,
  horas = 12,
): Promise<ReservaAgenda[]> {
  return comUsuario(usuario.id, (tx) =>
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
  return comUsuario(usuario.id, async (tx) => ({
    data,
    slots: await disponibilidadeTx(tx, usuario.empresa.id, data, data, null),
    reservas: await reservasTx(tx, eq(reservas.data, data)),
    bloqueios: await bloqueiosTx(tx, data, data),
  }));
}

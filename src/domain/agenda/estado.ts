import type { DataCivil } from '../dates';
import { sobrepoe, type Intervalo } from './slot';

export type TipoReserva = 'pre_reserva' | 'confirmada';
export type StatusReserva = 'ativa' | 'vencida' | 'cancelada' | 'realizada';
export type EstadoSlot = 'livre' | 'pre_reservado' | 'reservado' | 'bloqueado' | 'lotado';

export type Ocupacao = Intervalo & {
  espacoId: string;
  tipo: TipoReserva;
  status: StatusReserva;
  expiraEm: Date | null;
};

export type BloqueioSlot = { data: DataCivil; turnoId: string | null; espacoId: string | null };

export type Slot = Intervalo & { data: DataCivil; turnoId: string; espacoId: string };

export type ResultadoSlot = { estado: EstadoSlot; vagas: number; expiraEm: Date | null };

/** Ocupa o slot: ativa e (confirmada ou pré-reserva ainda não vencida). */
export function ocupaAgora(o: Ocupacao, agora: Date): boolean {
  if (o.status !== 'ativa') return false;
  if (o.tipo === 'confirmada') return true;
  return o.expiraEm !== null && o.expiraEm.getTime() > agora.getTime();
}

export function bloqueioValePara(b: BloqueioSlot, slot: Slot): boolean {
  return (
    b.data === slot.data &&
    (b.turnoId === null || b.turnoId === slot.turnoId) &&
    (b.espacoId === null || b.espacoId === slot.espacoId)
  );
}

/**
 * Estado do slot, com a mesma regra da função `disponibilidade` do banco:
 * bloqueio vence tudo; depois, as ocupações sobrepostas no mesmo espaço contam contra a
 * capacidade (`eventos_simultaneos`). Pré-reserva vencida conta como livre.
 */
export function estadoDoSlot(
  slot: Slot,
  ocupacoes: Ocupacao[],
  bloqueios: BloqueioSlot[],
  capacidade: number,
  agora: Date,
): ResultadoSlot {
  const ativas = ocupacoes.filter(
    (o) => o.espacoId === slot.espacoId && ocupaAgora(o, agora) && sobrepoe(o, slot),
  );
  const pre = ativas.filter((o) => o.tipo === 'pre_reserva');
  const expiraEm = pre.length ? new Date(Math.min(...pre.map((o) => o.expiraEm!.getTime()))) : null;

  if (bloqueios.some((b) => bloqueioValePara(b, slot))) {
    return { estado: 'bloqueado', vagas: 0, expiraEm };
  }
  const total = ativas.length;
  if (total >= capacidade) {
    const estado: EstadoSlot =
      capacidade > 1
        ? 'lotado'
        : ativas.some((o) => o.tipo === 'confirmada')
          ? 'reservado'
          : 'pre_reservado';
    return { estado, vagas: 0, expiraEm };
  }
  return { estado: 'livre', vagas: capacidade - total, expiraEm };
}

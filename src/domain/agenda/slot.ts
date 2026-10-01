import { fromZonedTime } from 'date-fns-tz';
import type { DataCivil } from '../dates';

/** Intervalo meio-aberto [inicio, fim) em instantes UTC. */
export type Intervalo = { inicio: Date; fim: Date };

export type TurnoSlot = { horaInicio: string; duracaoMin: number };

/**
 * Início e fim de um slot: `data + turno.horaInicio` no fuso da empresa, pela duração do turno,
 * somando o intervalo entre eventos (limpeza/montagem) ao fim. Igual a
 * `public._agenda_intervalo` no banco. O fuso resolve horário de verão histórico; somar
 * minutos é absoluto, então turnos que passam da meia-noite ou de uma troca de horário
 * terminam no instante certo.
 */
export function intervaloDoSlot(
  data: DataCivil,
  turno: TurnoSlot,
  fuso: string,
  intervaloEntreEventosMin: number,
): Intervalo {
  const hora = turno.horaInicio.length === 5 ? `${turno.horaInicio}:00` : turno.horaInicio;
  const inicio = fromZonedTime(`${data}T${hora}`, fuso);
  const fim = new Date(inicio.getTime() + (turno.duracaoMin + intervaloEntreEventosMin) * 60_000);
  return { inicio, fim };
}

/** [a.inicio, a.fim) e [b.inicio, b.fim) se sobrepõem? (encostar não conflita) */
export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime();
}

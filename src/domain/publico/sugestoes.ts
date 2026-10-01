import { diaDaSemanaNumero, formatData } from '../dates';
import type { DataCivil, Id } from '../preco';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export type Sugestao = { data: DataCivil; turnoId: Id };

/** "sáb, 21/11/2026 · Tarde (15:00)" */
export function rotuloSugestao(
  s: Sugestao,
  turnos: { id: Id; nome: string; horaInicio: string }[],
): string {
  const turno = turnos.find((t) => t.id === s.turnoId);
  const dia = `${DIAS[diaDaSemanaNumero(s.data)]}, ${formatData(s.data)}`;
  return turno ? `${dia} · ${turno.nome} (${turno.horaInicio})` : dia;
}

export const MENSAGEM_SLOT_INDISPONIVEL =
  'Essa data acabou de ser reservada por outra pessoa. Veja estas opções:';
export const MENSAGEM_SEM_SUGESTOES =
  'Essa data acabou de ser reservada por outra pessoa. Escolha outra data ou fale com o buffet.';

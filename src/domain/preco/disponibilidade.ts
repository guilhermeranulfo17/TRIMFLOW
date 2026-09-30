import { dataCivilValida, diaDaSemanaNumero } from '../dates';
import { pacoteValeParaTipo, pacotesAtivos } from './pacote';
import type { ContextoPreco, DataCivil, Id, OpcionalCtx, PacoteCtx, TurnoCtx } from './tipos';

export type PacoteDisponivel = { pacote: PacoteCtx; disponivel: boolean; motivo?: string };

/**
 * Pacotes ativos compatíveis com o tipo de evento. Com `equivalentes` informado, marca como
 * indisponível (com o motivo) o pacote fora do mínimo/máximo de convidados.
 */
export function pacotesDisponiveis(
  contexto: ContextoPreco,
  filtro: { tipoEventoId: Id; equivalentes?: number },
): PacoteDisponivel[] {
  return pacotesAtivos(contexto)
    .filter((p) => pacoteValeParaTipo(p, filtro.tipoEventoId))
    .map((pacote) => {
      const eq = filtro.equivalentes;
      if (eq !== undefined && eq < pacote.minConvidados) {
        return {
          pacote,
          disponivel: false,
          motivo: `a partir de ${pacote.minConvidados} convidados`,
        };
      }
      if (eq !== undefined && pacote.maxConvidados !== null && eq > pacote.maxConvidados) {
        return { pacote, disponivel: false, motivo: `até ${pacote.maxConvidados} convidados` };
      }
      return { pacote, disponivel: true };
    });
}

/** Opcionais que podem ser vendidos como extra: ativos, não inclusos e compatíveis. */
export function opcionaisDisponiveis(
  contexto: ContextoPreco,
  filtro: { pacoteId: Id; tipoEventoId: Id },
): OpcionalCtx[] {
  return contexto.opcionais
    .filter(
      (o) =>
        o.ativo &&
        !o.pacotesInclusoIds.includes(filtro.pacoteId) &&
        (o.pacotesCompativeisIds.length === 0 ||
          o.pacotesCompativeisIds.includes(filtro.pacoteId)) &&
        (o.tiposEventoIds.length === 0 || o.tiposEventoIds.includes(filtro.tipoEventoId)),
    )
    .sort((a, b) => a.ordem - b.ordem);
}

/** Turnos ativos que existem no dia da semana da data. */
export function turnosDoDia(contexto: ContextoPreco, data: DataCivil): TurnoCtx[] {
  if (!dataCivilValida(data)) return [];
  const dia = diaDaSemanaNumero(data);
  return contexto.turnos
    .filter((t) => t.ativo && t.diasSemana.includes(dia))
    .sort((a, b) => a.ordem - b.ordem || a.horaInicio.localeCompare(b.horaInicio));
}

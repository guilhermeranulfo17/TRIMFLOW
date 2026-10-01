import type { TemperaturaLead } from '../publico/status-lead';

/**
 * Reabriu a proposta 2 vezes ou mais nos últimos 3 dias = quente. ESPELHO de
 * public._temperatura_aberturas (migration 20261005000003), com teste de equivalência.
 * As aberturas contadas são as atividades "proposta_aberta" (no máximo 1 a cada 30 min).
 */
export function temperaturaPorAberturas(
  instantes: Date[],
  agora: Date,
  atual: TemperaturaLead,
): TemperaturaLead {
  const limite = agora.getTime() - 3 * 24 * 60 * 60 * 1000;
  const recentes = instantes.filter((i) => i.getTime() > limite && i.getTime() <= agora.getTime());
  return recentes.length >= 2 ? 'quente' : atual;
}

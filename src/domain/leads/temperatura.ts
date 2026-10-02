import { STATUS_ABERTOS, type StatusLead, type TemperaturaLead } from '../publico/status-lead';

/** Dias sem nenhuma ação (do cliente ou do vendedor) para um lead aberto ficar frio. */
export const DIAS_PARA_ESFRIAR = 7;

/**
 * Lead aberto parado há 7 dias fica frio (job diário esfriar_leads).
 * ESPELHO de public._temperatura_inatividade, com teste de equivalência.
 */
export function temperaturaPorInatividade(
  status: StatusLead,
  atual: TemperaturaLead,
  ultimaAtividade: Date,
  agora: Date,
): TemperaturaLead {
  const limite = agora.getTime() - DIAS_PARA_ESFRIAR * 86_400_000;
  return STATUS_ABERTOS.includes(status) && ultimaAtividade.getTime() <= limite ? 'frio' : atual;
}

export const ROTULO_TEMPERATURA: Record<TemperaturaLead, string> = {
  frio: 'Frio',
  morno: 'Morno',
  quente: 'Quente',
};

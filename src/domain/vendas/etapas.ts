/*
 * Vendas Orkestra (Etapa 14, §77): etapas do pipeline de vendas do próprio Orkestra. Espelho do
 * enum public.vendas_etapa (migration 20261020000001). Não confundir com o funil dos buffets
 * (domain/leads/funil).
 */

export const ETAPAS_VENDAS = [
  'novo',
  'abordado',
  'respondeu',
  'interessado',
  'fechando',
  'cliente',
  'perdido',
] as const;
export type EtapaVendas = (typeof ETAPAS_VENDAS)[number];

export const ROTULO_ETAPA_VENDAS: Record<EtapaVendas, string> = {
  novo: 'Novo',
  abordado: 'Abordado',
  respondeu: 'Respondeu',
  interessado: 'Interessado',
  fechando: 'Fechando',
  cliente: 'Cliente',
  perdido: 'Perdido',
};

/** Etapas em que a negociação acabou (fora da fila e dos follow-ups). */
export const ETAPAS_ENCERRADAS: readonly EtapaVendas[] = ['cliente', 'perdido'];

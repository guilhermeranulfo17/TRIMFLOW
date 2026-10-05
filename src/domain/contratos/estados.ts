/*
 * Status do contrato e as mudanças permitidas. ESPELHO das funções SQL de contrato
 * (emitir_contrato, cancelar_contrato, publico.contrato_*): o banco confere de novo.
 *
 * O buffet assina ao enviar, então a assinatura do cliente leva direto a "concluido".
 * "assinado_cliente" fica reservado para quando o buffet assinar depois (testemunhas, etc.).
 */

export const STATUS_CONTRATO = [
  'rascunho',
  'enviado',
  'assinado_cliente',
  'concluido',
  'recusado',
  'expirado',
  'cancelado',
] as const;
export type StatusContrato = (typeof STATUS_CONTRATO)[number];

export type EventoContrato =
  'enviar' | 'assinar_cliente' | 'assinar_buffet' | 'recusar' | 'expirar' | 'cancelar';

const TRANSICOES: Record<StatusContrato, Partial<Record<EventoContrato, StatusContrato>>> = {
  rascunho: { enviar: 'enviado', cancelar: 'cancelado' },
  enviado: {
    assinar_cliente: 'concluido',
    recusar: 'recusado',
    expirar: 'expirado',
    cancelar: 'cancelado',
  },
  assinado_cliente: { assinar_buffet: 'concluido', cancelar: 'cancelado' },
  recusado: { cancelar: 'cancelado' },
  expirado: { cancelar: 'cancelado' },
  concluido: {},
  cancelado: {},
};

/** Próximo status, ou null se o evento não vale nesse status. */
export function proximoStatusContrato(
  atual: StatusContrato,
  evento: EventoContrato,
): StatusContrato | null {
  return TRANSICOES[atual][evento] ?? null;
}

/** Texto, valores e impressão digital só mudam no rascunho. */
export const contratoEditavel = (s: StatusContrato): boolean => s === 'rascunho';

/** Status que não mudam mais (só ficam guardados). */
export const contratoFinal = (s: StatusContrato): boolean => s === 'concluido' || s === 'cancelado';

/** Pode ser refeito (cancelar e gerar um novo, com número próprio e ligação ao anterior). */
export const podeRefazer = (s: StatusContrato): boolean =>
  s === 'enviado' || s === 'recusado' || s === 'expirado' || s === 'cancelado';

export const ROTULO_STATUS: Record<StatusContrato, string> = {
  rascunho: 'Rascunho',
  enviado: 'Aguardando assinatura',
  assinado_cliente: 'Assinado pelo cliente',
  concluido: 'Concluído',
  recusado: 'Cliente pediu ajuste',
  expirado: 'Link vencido',
  cancelado: 'Cancelado',
};

/**
 * Vale também para o link: enviado e já vencido conta como expirado na leitura (antes do job),
 * como as propostas.
 */
export function statusEfetivo(
  status: StatusContrato,
  expiraEm: Date | string,
  agora: Date = new Date(),
): StatusContrato {
  if (status !== 'enviado') return status;
  return new Date(expiraEm).getTime() <= agora.getTime() ? 'expirado' : status;
}

import type { StatusLead } from '../publico/status-lead';

/** Cor do selo de status do lead. */
export const COR_STATUS_LEAD: Record<StatusLead, string> = {
  novo: 'bg-sky-100 text-sky-900',
  em_andamento: 'bg-violet-100 text-violet-900',
  abandonou: 'bg-zinc-200 text-zinc-800',
  pre_reservado: 'bg-amber-100 text-amber-900',
  reservado: 'bg-emerald-100 text-emerald-900',
  frio: 'bg-zinc-100 text-zinc-700',
  perdido: 'bg-rose-100 text-rose-900',
  cancelado: 'bg-rose-100 text-rose-900',
  realizado: 'bg-emerald-50 text-emerald-800',
};

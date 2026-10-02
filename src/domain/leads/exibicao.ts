import type { StatusLead } from '../publico/status-lead';

/** Cor do selo de status do lead (painel escuro). */
export const COR_STATUS_LEAD: Record<StatusLead, string> = {
  novo: 'bg-sky-400/15 text-sky-300',
  em_andamento: 'bg-violet-400/15 text-violet-300',
  abandonou: 'bg-zinc-500/20 text-zinc-300',
  pre_reservado: 'bg-amber-400/15 text-amber-300',
  reservado: 'bg-primary/15 text-primary',
  frio: 'bg-zinc-500/15 text-zinc-400',
  perdido: 'bg-rose-400/15 text-rose-300',
  cancelado: 'bg-rose-400/15 text-rose-300',
  realizado: 'bg-primary/10 text-primary/80',
};

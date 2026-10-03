import type { StatusLead } from '../publico/status-lead';

/** Cor do selo de status do lead (tokens de estado: valem nos temas claro e escuro). */
export const COR_STATUS_LEAD: Record<StatusLead, string> = {
  novo: 'bg-info/15 text-info',
  em_andamento: 'bg-foreground/10 text-foreground',
  abandonou: 'bg-muted text-muted-foreground',
  pre_reservado: 'bg-alerta/15 text-alerta',
  reservado: 'bg-primary/15 text-primary-texto',
  frio: 'bg-muted text-muted-foreground',
  perdido: 'bg-erro/15 text-erro',
  cancelado: 'bg-erro/15 text-erro',
  realizado: 'bg-primary/10 text-primary-texto',
};

/**
 * Regra de status do lead. ESPELHO de public._lead_transicao (migration 20261004000002), com
 * teste de equivalência: mudou uma, mude a outra.
 */
export type StatusLead =
  | 'novo'
  | 'em_andamento'
  | 'abandonou'
  | 'pre_reservado'
  | 'reservado'
  | 'frio'
  | 'perdido'
  | 'cancelado'
  | 'realizado';
export type TemperaturaLead = 'frio' | 'morno' | 'quente';
export type EventoLead =
  | 'lead_criado'
  | 'voltou'
  | 'orcamento_iniciado'
  | 'orcamento_concluido'
  | 'pre_reserva_pedida'
  | 'visita_pedida'
  | 'pre_reserva_vencida'
  | 'pre_reserva_cancelada'
  | 'reserva_confirmada'
  | 'reserva_cancelada'
  | 'realizada'
  | 'abandonou'
  | 'whatsapp_clicado';

export const STATUS_LEAD: StatusLead[] = [
  'novo',
  'em_andamento',
  'abandonou',
  'pre_reservado',
  'reservado',
  'frio',
  'perdido',
  'cancelado',
  'realizado',
];
export const TEMPERATURAS: TemperaturaLead[] = ['frio', 'morno', 'quente'];
export const EVENTOS_LEAD: EventoLead[] = [
  'lead_criado',
  'voltou',
  'orcamento_iniciado',
  'orcamento_concluido',
  'pre_reserva_pedida',
  'visita_pedida',
  'pre_reserva_vencida',
  'pre_reserva_cancelada',
  'reserva_confirmada',
  'reserva_cancelada',
  'realizada',
  'abandonou',
  'whatsapp_clicado',
];

const VOLTA_PARA_ANDAMENTO: StatusLead[] = [
  'abandonou',
  'frio',
  'novo',
  'perdido',
  'cancelado',
  'realizado',
];

function proximoStatus(s: StatusLead, evento: EventoLead): StatusLead {
  switch (evento) {
    case 'lead_criado':
      return 'novo';
    case 'voltou':
      return VOLTA_PARA_ANDAMENTO.includes(s) ? 'em_andamento' : s;
    case 'orcamento_concluido':
      return s === 'pre_reservado' || s === 'reservado' ? s : 'em_andamento';
    case 'pre_reserva_pedida':
      return s === 'reservado' ? 'reservado' : 'pre_reservado';
    case 'pre_reserva_vencida':
    case 'pre_reserva_cancelada':
      return s === 'pre_reservado' ? 'em_andamento' : s;
    case 'reserva_confirmada':
      return 'reservado';
    case 'reserva_cancelada':
      return s === 'reservado' ? 'cancelado' : s;
    case 'realizada':
      return 'realizado';
    case 'abandonou':
      return s === 'novo' ? 'abandonou' : s;
    default:
      return s;
  }
}

function proximaTemperatura(t: TemperaturaLead, evento: EventoLead): TemperaturaLead {
  if (evento === 'pre_reserva_pedida' || evento === 'visita_pedida') return 'quente';
  if (evento === 'orcamento_concluido' && t !== 'quente') return 'morno';
  return t;
}

export function transicaoLead(
  atual: { status: StatusLead; temperatura: TemperaturaLead },
  evento: EventoLead,
): { status: StatusLead; temperatura: TemperaturaLead } {
  return {
    status: proximoStatus(atual.status, evento),
    temperatura: proximaTemperatura(atual.temperatura, evento),
  };
}

export const ROTULO_STATUS_LEAD: Record<StatusLead, string> = {
  novo: 'Novo',
  em_andamento: 'Em andamento',
  abandonou: 'Abandonou',
  pre_reservado: 'Pré-reservado',
  reservado: 'Reservado',
  frio: 'Frio',
  perdido: 'Perdido',
  cancelado: 'Cancelado',
  realizado: 'Realizado',
};

/**
 * Regra de status do lead. ESPELHO de public._lead_transicao (última versão: migration
 * 20261006000002), com teste de equivalência: mudou uma, mude a outra.
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
  | 'whatsapp_clicado'
  | 'orcamento_criado'
  | 'versao_criada'
  | 'orcamento_expirado'
  | 'proposta_aberta'
  | 'proposta_enviada'
  // Etapa 6: ações do vendedor
  | 'contato_registrado'
  | 'visita_confirmada'
  | 'perdido'
  | 'reaberto'
  | 'nota'
  | 'tarefa_criada'
  | 'tarefa_feita'
  | 'responsavel_alterado'
  | 'visita_realizada'
  | 'visita_cancelada'
  | 'mensagem_copiada';

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
  'orcamento_criado',
  'versao_criada',
  'orcamento_expirado',
  'proposta_aberta',
  'proposta_enviada',
  'contato_registrado',
  'visita_confirmada',
  'perdido',
  'reaberto',
  'nota',
  'tarefa_criada',
  'tarefa_feita',
  'responsavel_alterado',
  'visita_realizada',
  'visita_cancelada',
  'mensagem_copiada',
];

/** Status em que o lead ainda está em negociação (aparecem na caixa padrão). */
export const STATUS_ABERTOS: StatusLead[] = [
  'novo',
  'em_andamento',
  'abandonou',
  'frio',
  'pre_reservado',
];
/** De onde o vendedor pode marcar perdido (reservado não: cancele a reserva na Agenda). */
export const PODE_PERDER: StatusLead[] = STATUS_ABERTOS;

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
    case 'orcamento_criado':
    case 'versao_criada':
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
    case 'orcamento_expirado':
      return s === 'em_andamento' ? 'frio' : s;
    case 'contato_registrado':
    case 'visita_confirmada':
      return s === 'novo' || s === 'abandonou' || s === 'frio' ? 'em_andamento' : s;
    case 'perdido':
      return 'perdido';
    default:
      return s;
  }
}

function proximaTemperatura(t: TemperaturaLead, evento: EventoLead): TemperaturaLead {
  if (
    evento === 'pre_reserva_pedida' ||
    evento === 'visita_pedida' ||
    evento === 'visita_confirmada'
  ) {
    return 'quente';
  }
  if (
    (evento === 'orcamento_concluido' ||
      evento === 'orcamento_criado' ||
      evento === 'versao_criada') &&
    t !== 'quente'
  ) {
    return 'morno';
  }
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

/**
 * Reabrir um perdido: volta ao status de antes. Pré-reservado volta como em andamento (a
 * pré-reserva foi cancelada ao perder). ESPELHO de public._lead_status_reaberto.
 */
export function statusAoReabrir(antes: StatusLead | null): StatusLead {
  if (antes === 'novo' || antes === 'em_andamento' || antes === 'abandonou' || antes === 'frio') {
    return antes;
  }
  return 'em_andamento';
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

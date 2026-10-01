import { formatData } from '../dates';
import { formatBRL } from '../money';
import { ROTULO_STATUS_LEAD, type StatusLead } from '../publico/status-lead';

/** Filtros da lista de leads (chips). */
export const FILTROS_LEAD = [
  { chave: 'todos', rotulo: 'Todos', status: null },
  { chave: 'novos', rotulo: 'Novos', status: ['novo'] },
  { chave: 'andamento', rotulo: 'Em andamento', status: ['em_andamento'] },
  { chave: 'pre-reservados', rotulo: 'Pré-reservados', status: ['pre_reservado'] },
  { chave: 'reservados', rotulo: 'Reservados', status: ['reservado'] },
  { chave: 'abandonaram', rotulo: 'Abandonaram', status: ['abandonou'] },
] as const satisfies readonly { chave: string; rotulo: string; status: StatusLead[] | null }[];

export type ChaveFiltro = (typeof FILTROS_LEAD)[number]['chave'];

export function filtroValido(valor: unknown): ChaveFiltro {
  return FILTROS_LEAD.find((f) => f.chave === valor)?.chave ?? 'todos';
}

/** "agora", "há 5 min", "há 2 h", "ontem", "há 3 dias", "14/11/2026". */
export function haQuantoTempo(instante: Date, agora: Date): string {
  const min = Math.floor((agora.getTime() - instante.getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return formatData(instante);
}

/** "Festa infantil · 14/11 · Tarde · 60 convidados" (só o que existir). */
export function resumoDaFesta(f: {
  tipoEvento?: string | null;
  data?: string | null;
  turno?: string | null;
  convidados?: number | null;
}): string {
  return [
    f.tipoEvento,
    f.data ? formatData(f.data).slice(0, 5) : null,
    f.turno,
    f.convidados ? `${f.convidados} convidados` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const PERIODOS: Record<string, string> = { manha: 'manhã', tarde: 'tarde', noite: 'noite' };

/** Texto da linha do tempo para cada atividade. */
export function descreverAtividade(tipo: string, dados: Record<string, unknown>): string {
  const data = typeof dados.data === 'string' ? formatData(dados.data) : null;
  switch (tipo) {
    case 'lead_criado':
      return 'Pediu orçamento pelo link';
    case 'orcamento_iniciado':
      return dados.numero
        ? `Começou o orçamento nº ${String(dados.numero)}`
        : 'Começou um orçamento';
    case 'orcamento_concluido':
      return typeof dados.total_centavos === 'number'
        ? `Viu a proposta: ${formatBRL(dados.total_centavos)}`
        : 'Viu a proposta';
    case 'voltou':
      return typeof dados.nome_informado === 'string'
        ? `Voltou ao link (informou o nome "${dados.nome_informado}")`
        : 'Voltou ao link';
    case 'pre_reserva_pedida':
      return data ? `Pediu pré-reserva para ${data}` : 'Pediu pré-reserva';
    case 'pre_reserva_vencida':
      return data ? `A pré-reserva de ${data} venceu` : 'A pré-reserva venceu';
    case 'visita_pedida': {
      const quando =
        typeof dados.data_preferida === 'string' ? formatData(dados.data_preferida) : '';
      const periodo = PERIODOS[String(dados.periodo)] ?? '';
      return `Pediu visita${quando ? ` para ${quando}` : ''}${periodo ? ` (${periodo})` : ''}`;
    }
    case 'whatsapp_clicado':
      return 'Tocou em falar no WhatsApp';
    case 'reserva_confirmada':
      return data ? `Reserva de ${data} confirmada` : 'Reserva confirmada';
    case 'reserva_cancelada': {
      const qual = dados.tipo === 'pre_reserva' ? 'Pré-reserva' : 'Reserva';
      const motivo = typeof dados.motivo === 'string' ? `: ${dados.motivo}` : '';
      return `${qual}${data ? ` de ${data}` : ''} cancelada${motivo}`;
    }
    case 'status_alterado': {
      const depois = ROTULO_STATUS_LEAD[dados.status_depois as StatusLead];
      return depois ? `Status mudou para ${depois}` : 'Status alterado';
    }
    default:
      return 'Atividade';
  }
}

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

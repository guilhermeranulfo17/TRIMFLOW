import { formatData, formatDataHora } from '../dates';
import { formatBRL } from '../money';
import { ROTULO_STATUS_LEAD, type StatusLead } from '../publico/status-lead';
import { ROTULO_SITUACAO, type SituacaoMensagem } from './mensagens';
import { rotuloMotivoPerda } from './motivos-perda';

const CANAL_CONTATO: Record<string, string> = {
  whatsapp: 'pelo WhatsApp',
  ligacao: 'por ligação',
  presencial: 'pessoalmente',
};

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

const numeroDe = (dados: Record<string, unknown>) =>
  typeof dados.numero === 'number' ? ` nº ${String(dados.numero).padStart(4, '0')}` : '';
const totalDe = (dados: Record<string, unknown>) =>
  typeof dados.total_centavos === 'number' ? `: ${formatBRL(dados.total_centavos)}` : '';

/**
 * Texto da linha do tempo para cada atividade. `quem` é o nome de quem fez, quando foi alguém
 * da equipe (null = cliente ou sistema).
 */
export function descreverAtividade(
  tipo: string,
  dados: Record<string, unknown>,
  quem: string | null = null,
): string {
  const data = typeof dados.data === 'string' ? formatData(dados.data) : null;
  const equipe = quem ?? 'A equipe';
  switch (tipo) {
    case 'orcamento_criado':
      return `${equipe} criou o orçamento${numeroDe(dados)}${totalDe(dados)}`;
    case 'versao_criada': {
      const versao = typeof dados.versao === 'number' ? `a versão ${dados.versao}` : 'uma versão';
      return quem
        ? `${quem} criou ${versao} do orçamento${numeroDe(dados)}${totalDe(dados)}`
        : `Refez a proposta${numeroDe(dados)} (${versao.replace('a versão', 'versão')})${totalDe(dados)}`;
    }
    case 'proposta_enviada':
      switch (dados.canal) {
        case 'whatsapp':
          return `${equipe} enviou a proposta${numeroDe(dados)} pelo WhatsApp`;
        case 'pdf':
          return `${equipe} baixou o PDF da proposta${numeroDe(dados)}`;
        default:
          return `${equipe} copiou o link da proposta${numeroDe(dados)}`;
      }
    case 'proposta_aberta': {
      const vez = typeof dados.vez === 'number' && dados.vez > 1 ? ` (${dados.vez}ª vez)` : '';
      return `Abriu a proposta${numeroDe(dados)}${vez}`;
    }
    case 'orcamento_expirado':
      return `A proposta${numeroDe(dados)} venceu`;
    case 'lead_criado':
      return dados.canal === 'interno'
        ? `${equipe} cadastrou o cliente`
        : 'Pediu orçamento pelo link';
    case 'orcamento_iniciado':
      return dados.numero
        ? `Começou o orçamento nº ${String(dados.numero)}`
        : 'Começou um orçamento';
    case 'orcamento_concluido':
      return typeof dados.total_centavos === 'number'
        ? `Viu a proposta: ${formatBRL(dados.total_centavos)}`
        : 'Viu a proposta';
    case 'voltou':
      if (dados.canal === 'interno') return `${equipe} atendeu o cliente de novo`;
      return typeof dados.nome_informado === 'string'
        ? `Voltou ao link (informou o nome "${dados.nome_informado}")`
        : 'Voltou ao link';
    case 'pre_reserva_pedida':
      if (quem) return data ? `${quem} pré-reservou ${data}` : `${quem} fez uma pré-reserva`;
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
    // Etapa 6: ações do vendedor
    case 'contato_registrado': {
      const canal = CANAL_CONTATO[String(dados.canal)] ?? '';
      const resumo = typeof dados.resumo === 'string' && dados.resumo ? `: ${dados.resumo}` : '';
      return `${equipe} falou com o cliente${canal ? ` ${canal}` : ''}${resumo}`;
    }
    case 'nota':
      return `${equipe} anotou${typeof dados.trecho === 'string' ? `: ${dados.trecho}` : ''}`;
    case 'tarefa_criada':
      if (dados.automatica === true) {
        return typeof dados.titulo === 'string'
          ? `Tarefa automática: "${dados.titulo}"`
          : 'Tarefa automática criada';
      }
      return typeof dados.titulo === 'string'
        ? `${equipe} criou a tarefa "${dados.titulo}"`
        : `${equipe} criou uma tarefa`;
    case 'tarefa_feita':
      return typeof dados.titulo === 'string'
        ? `${equipe} concluiu "${dados.titulo}"`
        : `${equipe} concluiu uma tarefa`;
    case 'responsavel_alterado': {
      const para = typeof dados.para_nome === 'string' ? dados.para_nome : null;
      if (para && quem && para === quem) return `${quem} assumiu o lead`;
      return para ? `${equipe} passou o lead para ${para}` : `${equipe} mudou o responsável`;
    }
    case 'perdido': {
      const motivo = rotuloMotivoPerda(dados.motivo as string);
      const detalhe =
        typeof dados.detalhe === 'string' && dados.detalhe ? ` (${dados.detalhe})` : '';
      return `${equipe} marcou como perdido${motivo ? `: ${motivo}` : ''}${detalhe}`;
    }
    case 'reaberto':
      return `${equipe} reabriu o lead`;
    case 'visita_confirmada': {
      const quando =
        typeof dados.data_hora === 'string' ? ` para ${formatDataHora(dados.data_hora)}` : '';
      return dados.remarcada
        ? `${equipe} remarcou a visita${quando}`
        : `${equipe} confirmou a visita${quando}`;
    }
    case 'visita_realizada':
      return 'Visita realizada';
    case 'visita_cancelada': {
      const motivo = typeof dados.motivo === 'string' && dados.motivo ? `: ${dados.motivo}` : '';
      return `${equipe} cancelou a visita${motivo}`;
    }
    case 'mensagem_copiada': {
      const situacao = ROTULO_SITUACAO[dados.situacao as SituacaoMensagem];
      return `${equipe} abriu o WhatsApp com a mensagem${situacao ? ` "${situacao}"` : ''}`;
    }
    default:
      return 'Atividade';
  }
}

export * from './adiar';
export * from './exibicao';
export * from './filtros';
export * from './funil';
export * from './mensagens';
export * from './motivos-perda';
export * from './prioridade';
export * from './temperatura';

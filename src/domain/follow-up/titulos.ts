import { formatInTimeZone } from 'date-fns-tz';
import { FUSO_PADRAO } from '../dates';
import type { SituacaoMensagem } from '../leads/mensagens';
import type { RegraFollowUp } from './regras';

/*
 * Textos das tarefas automáticas. O título é gravado pelo banco (ESPELHO de
 * public._follow_up_titulo, com teste de equivalência); a mensagem pronta é montada aqui na
 * leitura, a partir de tarefas.mensagem_dados ({situacao, ...}).
 */

const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

export function tituloTarefa(
  regra: RegraFollowUp,
  nome: string,
  o: { visitaEm?: Date | null; fuso?: string } = {},
): string {
  const n = primeiro(nome);
  switch (regra) {
    case 'sem_resposta_24h':
      return `Chamar ${n}: recebeu a proposta e não respondeu`;
    case 'segundo_toque':
      return `Segundo contato com ${n}: ainda sem resposta`;
    case 'proposta_vencendo':
      return `Avisar ${n}: a proposta está para vencer`;
    case 'proposta_vencida':
      return `Último contato com ${n}: a proposta venceu`;
    case 'pre_reserva_vencendo':
      return `Cobrar o sinal de ${n}: a pré-reserva vence logo`;
    case 'visita_amanha':
      return o.visitaEm
        ? `Confirmar a visita de ${n} amanhã às ${formatInTimeZone(o.visitaEm, o.fuso ?? FUSO_PADRAO, 'HH:mm')}`
        : `Confirmar a visita de ${n} amanhã`;
    case 'pos_visita':
      return `Perguntar o que ${n} achou da visita e oferecer a pré-reserva`;
    case 'quente_sem_contato':
      return `${n} está quente: chame agora`;
  }
}

/** Situação da mensagem pronta de cada regra (sem_resposta muda se a proposta foi aberta). */
export function situacaoDaRegra(regra: RegraFollowUp, propostaAberta: boolean): SituacaoMensagem {
  switch (regra) {
    case 'sem_resposta_24h':
      return propostaAberta ? 'proposta_sem_resposta' : 'proposta_nao_aberta';
    case 'segundo_toque':
      return 'segundo_toque';
    case 'proposta_vencendo':
      return 'proposta_vencendo';
    case 'proposta_vencida':
      return 'ultimo_contato';
    case 'pre_reserva_vencendo':
      return 'pre_reserva_vencendo';
    case 'visita_amanha':
      return 'confirmacao_visita';
    case 'pos_visita':
      return 'pos_visita';
    case 'quente_sem_contato':
      return 'chamar_quente';
  }
}

/** Selo "Automática" na tarefa: por que ela existe. */
export const MOTIVO_REGRA: Record<RegraFollowUp, string> = {
  sem_resposta_24h: 'Proposta sem resposta',
  segundo_toque: 'Segundo toque',
  proposta_vencendo: 'Proposta vencendo',
  proposta_vencida: 'Proposta vencida',
  pre_reserva_vencendo: 'Pré-reserva vencendo',
  visita_amanha: 'Visita amanhã',
  pos_visita: 'Depois da visita',
  quente_sem_contato: 'Lead quente',
};

/** Frase de Minha empresa → Follow-up (o {prazo} vira o número escolhido). */
export const EXPLICACAO_REGRA: Record<RegraFollowUp, { titulo: string; frase: string }> = {
  sem_resposta_24h: {
    titulo: 'Proposta sem resposta',
    frase: 'Cria "chamar o cliente" {prazo} depois do envio da proposta, se ninguém se mexeu.',
  },
  segundo_toque: {
    titulo: 'Segundo toque',
    frase:
      'Se o cliente seguiu calado {prazo} depois do primeiro contato, cria um segundo, citando a data só se ela ainda estiver livre.',
  },
  proposta_vencendo: {
    titulo: 'Proposta vencendo',
    frase: 'Cria um lembrete {prazo} antes de a proposta vencer.',
  },
  proposta_vencida: {
    titulo: 'Proposta vencida',
    frase: 'No dia seguinte ao vencimento, cria um último contato com o cliente.',
  },
  pre_reserva_vencendo: {
    titulo: 'Cobrar o sinal',
    frase: 'Cria "cobrar o sinal" {prazo} antes de a pré-reserva vencer.',
  },
  visita_amanha: {
    titulo: 'Confirmar visita',
    frase: 'Na véspera de uma visita confirmada, cria "confirmar a visita".',
  },
  pos_visita: {
    titulo: 'Depois da visita',
    frase: 'No dia seguinte à visita, cria "perguntar o que achou e oferecer a pré-reserva".',
  },
  quente_sem_contato: {
    titulo: 'Lead quente sem contato',
    frase:
      'Se o lead ficou quente e ninguém falou com ele em {prazo} (horário comercial), cria "chamar agora".',
  },
};

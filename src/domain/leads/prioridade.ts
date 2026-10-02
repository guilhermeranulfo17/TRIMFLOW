import { formatInTimeZone } from 'date-fns-tz';
import { FUSO_PADRAO, hojeNoFuso, somarDias } from '../dates';
import { ROTULO_STATUS_LEAD, type StatusLead, type TemperaturaLead } from '../publico/status-lead';
import { instanteLocal } from './adiar';

/*
 * Prioridade da caixa de leads. ESPELHO de public._lead_grupo e public._lead_ordem (a ordenação
 * e a paginação acontecem no banco); aqui também mora o motivo legível do cartão. Teste de
 * integração compara a ordem da consulta com esta função.
 *
 * Ordem do documento: pré-reserva > visita > quente > novo > em andamento.
 *   1 pré-reserva ativa (a que vence primeiro no topo)
 *   2 visita pedida e ainda não confirmada, ou confirmada para hoje ou amanhã
 *   3 tarefa do usuário atrasada ou de hoje
 *   4 quente (mais recente primeiro)
 *   5 novo sem nenhum contato (quem espera há mais tempo primeiro)
 *   6 em andamento com próximo contato vencido
 *   7 demais abertos (em andamento, abandonou, frio), por última atividade
 *   8 reservado, realizado, perdido e cancelado (fora da caixa padrão)
 */

export type GrupoPrioridade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type EntradaPrioridade = {
  status: StatusLead;
  temperatura: TemperaturaLead;
  preReservaExpiraEm: Date | null;
  visitaPedida: boolean;
  /** quando o pedido de visita (ainda não confirmado) foi feito */
  visitaPedidaEm?: Date | null;
  /** próxima visita confirmada (das últimas 3 horas em diante) */
  visitaProxima: Date | null;
  /** tarefa aberta do usuário que vence primeiro */
  tarefaVence: Date | null;
  primeiroContatoEm: Date | null;
  proximoContatoEm: Date | null;
  criadoEm: Date;
  ultimaAtividadeEm: Date;
  aberturas?: number;
};

export type LimitesDia = { fimHoje: Date; fimAmanha: Date };

/** Fim de hoje e de amanhã (meia-noite) no fuso da empresa. */
export function limitesDoDia(agora: Date, fuso: string = FUSO_PADRAO): LimitesDia {
  const hoje = hojeNoFuso(fuso, agora);
  return {
    fimHoje: instanteLocal(somarDias(hoje, 1), '00:00', fuso),
    fimAmanha: instanteLocal(somarDias(hoje, 2), '00:00', fuso),
  };
}

const FECHADOS: StatusLead[] = ['reservado', 'realizado', 'perdido', 'cancelado'];

export function grupoDoLead(e: EntradaPrioridade, agora: Date, l: LimitesDia): GrupoPrioridade {
  if (FECHADOS.includes(e.status)) return 8;
  if (e.preReservaExpiraEm && e.preReservaExpiraEm > agora) return 1;
  if (e.visitaPedida || (e.visitaProxima && e.visitaProxima < l.fimAmanha)) return 2;
  if (e.tarefaVence && e.tarefaVence < l.fimHoje) return 3;
  if (e.temperatura === 'quente') return 4;
  if (e.status === 'novo' && !e.primeiroContatoEm) return 5;
  if (e.status === 'em_andamento' && e.proximoContatoEm && e.proximoContatoEm <= agora) return 6;
  return 7;
}

const micro = (d: Date | null | undefined) => (d ? d.getTime() * 1000 : Number.NaN);

/** Chave crescente dentro do grupo, em microssegundos (o SQL devolve bigint). */
export function ordemNoGrupo(g: GrupoPrioridade, e: EntradaPrioridade): number {
  switch (g) {
    case 1:
      return micro(e.preReservaExpiraEm);
    case 2:
      return micro(e.visitaPedidaEm ?? e.visitaProxima);
    case 3:
      return micro(e.tarefaVence);
    case 5:
      return micro(e.criadoEm);
    case 6:
      return micro(e.proximoContatoEm);
    default:
      return -micro(e.ultimaAtividadeEm);
  }
}

/** Ordena como a caixa (grupo, ordem, id). */
export function ordenarCaixa<T extends EntradaPrioridade & { id: string }>(
  leads: T[],
  agora: Date,
  fuso: string = FUSO_PADRAO,
): (T & { grupo: GrupoPrioridade; ordem: number })[] {
  const l = limitesDoDia(agora, fuso);
  return leads
    .map((x) => {
      const grupo = grupoDoLead(x, agora, l);
      return { ...x, grupo, ordem: ordemNoGrupo(grupo, x) };
    })
    .sort(
      (a, b) => a.grupo - b.grupo || a.ordem - b.ordem || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

function prazo(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)} dias`;
}

function haQuanto(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 60) return min < 2 ? 'agora' : `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

function quando(d: Date, agora: Date, fuso: string): string {
  const dia = formatInTimeZone(d, fuso, 'yyyy-MM-dd');
  const hoje = hojeNoFuso(fuso, agora);
  const horaTxt = formatInTimeZone(d, fuso, 'HH:mm');
  if (dia === hoje) return `hoje às ${horaTxt}`;
  if (dia === somarDias(hoje, 1)) return `amanhã às ${horaTxt}`;
  return `${formatInTimeZone(d, fuso, 'dd/MM')} às ${horaTxt}`;
}

/** Motivo legível do cartão ("Pré-reserva vence em 5h", "Esperando há 2 dias"…). */
export function motivoPrioridade(
  g: GrupoPrioridade,
  e: EntradaPrioridade,
  agora: Date,
  fuso: string = FUSO_PADRAO,
): string {
  switch (g) {
    case 1:
      return `Pré-reserva vence em ${prazo(e.preReservaExpiraEm!.getTime() - agora.getTime())}`;
    case 2:
      if (e.visitaPedida) return 'Pediu visita';
      return `Visita ${quando(e.visitaProxima!, agora, fuso)}`;
    case 3:
      return e.tarefaVence! < agora
        ? 'Tarefa atrasada'
        : `Tarefa ${quando(e.tarefaVence!, agora, fuso)}`;
    case 4:
      return (e.aberturas ?? 0) >= 2 ? `Abriu a proposta ${e.aberturas}x` : 'Lead quente';
    case 5: {
      const espera = haQuanto(agora.getTime() - e.criadoEm.getTime());
      return espera === 'agora' ? 'Chegou agora' : `Esperando ${espera}`;
    }
    case 6:
      return 'Próximo contato vencido';
    case 7:
      if (e.status === 'abandonou') return 'Parou no meio do orçamento';
      return `Última atividade ${haQuanto(agora.getTime() - e.ultimaAtividadeEm.getTime())}`;
    case 8:
      return ROTULO_STATUS_LEAD[e.status];
  }
}

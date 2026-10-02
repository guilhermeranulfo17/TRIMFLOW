import { formatInTimeZone } from 'date-fns-tz';
import { FUSO_PADRAO, diaDaSemanaNumero, somarDias, type DataCivil } from '../dates';
import { instanteLocal } from '../leads/adiar';
import type { StatusLead, TemperaturaLead } from '../publico/status-lead';

/*
 * Follow-up automático: quando o sistema cria (e cancela) uma tarefa de acompanhamento.
 * ESPELHO de public._follow_up_avaliar (o job gerar_tarefas_automaticas avalia no banco); um
 * teste de equivalência compara as duas numa tabela de casos. Mudou uma, mude a outra.
 *
 * Cada regra tem:
 *   aplica  a situação ainda pede a tarefa (sem olhar o relógio); se não aplica, a tarefa
 *           aberta é cancelada;
 *   base    o fato que "abre" a regra (proposta enviada, tarefa anterior feita…); tarefa criada
 *           antes da base é de uma situação antiga: cancela;
 *   quando  a partir de quando a tarefa nasce.
 * Uma regra cria no máximo uma vez por base (tarefaCriadaEm >= base não cria de novo).
 */

export const REGRAS_FOLLOW_UP = [
  'sem_resposta_24h',
  'segundo_toque',
  'proposta_vencendo',
  'proposta_vencida',
  'pre_reserva_vencendo',
  'visita_amanha',
  'pos_visita',
  'quente_sem_contato',
] as const;
export type RegraFollowUp = (typeof REGRAS_FOLLOW_UP)[number];

export type UnidadePrazo = 'horas' | 'dias';

/** Prazo editável de cada regra (null = não tem prazo) e o padrão. */
export const PRAZOS: Record<
  RegraFollowUp,
  { padrao: number; min: number; max: number; unidade: UnidadePrazo } | null
> = {
  sem_resposta_24h: { padrao: 24, min: 6, max: 72, unidade: 'horas' },
  segundo_toque: { padrao: 3, min: 1, max: 7, unidade: 'dias' },
  proposta_vencendo: { padrao: 2, min: 1, max: 5, unidade: 'dias' },
  proposta_vencida: null,
  pre_reserva_vencendo: { padrao: 12, min: 2, max: 24, unidade: 'horas' },
  visita_amanha: null,
  pos_visita: null,
  quente_sem_contato: { padrao: 2, min: 1, max: 8, unidade: 'horas' },
};

/** Ligada por padrão (proposta_vencida nasce desligada). */
export const LIGADA_PADRAO: Record<RegraFollowUp, boolean> = {
  sem_resposta_24h: true,
  segundo_toque: true,
  proposta_vencendo: true,
  proposta_vencida: false,
  pre_reserva_vencendo: true,
  visita_amanha: true,
  pos_visita: true,
  quente_sem_contato: true,
};

export function prazoValido(regra: RegraFollowUp, prazo: number | null): boolean {
  const p = PRAZOS[regra];
  if (!p) return prazo === null;
  return prazo !== null && Number.isInteger(prazo) && prazo >= p.min && prazo <= p.max;
}

/** Situação do lead que as regras olham (o banco monta o mesmo objeto, em snake_case). */
export type FatosFollowUp = {
  status: StatusLead;
  temperatura: TemperaturaLead;
  /** desde quando está quente (última ação do cliente que esquentou) */
  quenteDesde: Date | null;
  /** versão vigente do orçamento */
  propostaEnviadaEm: Date | null;
  orcamentoStatus: 'enviado' | 'visualizado' | 'aceito' | 'expirado' | 'em_montagem' | null;
  /** yyyy-MM-dd, inclusive */
  validadeAte: DataCivil | null;
  /** última ação do cliente que conta como resposta (pré-reserva, visita, WhatsApp) */
  ultimaAcaoClienteEm: Date | null;
  ultimaAcaoVendedorEm: Date | null;
  preReservaExpiraEm: Date | null;
  preReservaCriadaEm: Date | null;
  /** próxima visita confirmada */
  visitaEm: Date | null;
  visitaRealizadaEm: Date | null;
  /** quando a tarefa sem_resposta_24h mais recente foi concluída */
  semRespostaFeitaEm: Date | null;
};

export type Avaliacao = 'criar' | 'cancelar' | 'nada';

const ABERTOS: StatusLead[] = ['novo', 'em_andamento', 'abandonou', 'frio', 'pre_reservado'];

const depois = (a: Date | null, b: Date | null) => !!a && !!b && a.getTime() > b.getTime();
const somarHoras = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
const diaLocal = (d: Date, fuso: string): DataCivil => formatInTimeZone(d, fuso, 'yyyy-MM-dd');

/** Horário comercial: segunda a sábado, das 9h às 18h, no fuso da empresa. */
export function proximoHorarioComercial(d: Date, fuso: string = FUSO_PADRAO): Date {
  let dia = diaLocal(d, fuso);
  const hora = formatInTimeZone(d, fuso, 'HH:mm:ss');
  for (let i = 0; i < 8; i++) {
    const util = diaDaSemanaNumero(dia) !== 0;
    if (util) {
      if (i === 0 && hora >= '09:00:00' && hora < '18:00:00') return d;
      if (i > 0 || hora < '09:00:00') return instanteLocal(dia, '09:00', fuso);
    }
    dia = somarDias(dia, 1);
  }
  return d;
}

type Regra = {
  aplica: (f: FatosFollowUp, agora: Date, fuso: string) => boolean;
  base: (f: FatosFollowUp, fuso: string) => Date | null;
  quando: (f: FatosFollowUp, prazo: number, fuso: string) => Date | null;
};

const semResposta = (f: FatosFollowUp, desde: Date | null) =>
  ABERTOS.includes(f.status) &&
  f.status !== 'pre_reservado' &&
  !!desde &&
  !depois(f.ultimaAcaoClienteEm, desde) &&
  !depois(f.ultimaAcaoVendedorEm, desde);

const REGRAS: Record<RegraFollowUp, Regra> = {
  sem_resposta_24h: {
    aplica: (f) => semResposta(f, f.propostaEnviadaEm),
    base: (f) => f.propostaEnviadaEm,
    quando: (f, prazo) => (f.propostaEnviadaEm ? somarHoras(f.propostaEnviadaEm, prazo) : null),
  },
  segundo_toque: {
    aplica: (f) => semResposta(f, f.semRespostaFeitaEm),
    base: (f) => f.semRespostaFeitaEm,
    quando: (f, prazo) =>
      f.semRespostaFeitaEm ? somarHoras(f.semRespostaFeitaEm, prazo * 24) : null,
  },
  proposta_vencendo: {
    aplica: (f, agora, fuso) =>
      ABERTOS.includes(f.status) &&
      f.status !== 'pre_reservado' &&
      (f.orcamentoStatus === 'enviado' || f.orcamentoStatus === 'visualizado') &&
      !!f.validadeAte &&
      f.validadeAte >= diaLocal(agora, fuso),
    base: (f) => f.propostaEnviadaEm,
    quando: (f, prazo, fuso) =>
      f.validadeAte ? instanteLocal(somarDias(f.validadeAte, -prazo), '09:00', fuso) : null,
  },
  proposta_vencida: {
    aplica: (f) =>
      ABERTOS.includes(f.status) &&
      f.status !== 'pre_reservado' &&
      f.orcamentoStatus === 'expirado' &&
      !!f.validadeAte,
    base: (f) => f.propostaEnviadaEm,
    quando: (f, _prazo, fuso) =>
      f.validadeAte ? instanteLocal(somarDias(f.validadeAte, 1), '09:00', fuso) : null,
  },
  pre_reserva_vencendo: {
    aplica: (f, agora) =>
      ABERTOS.includes(f.status) && depois(f.preReservaExpiraEm, agora) && !!f.preReservaCriadaEm,
    base: (f) => f.preReservaCriadaEm,
    quando: (f, prazo) => (f.preReservaExpiraEm ? somarHoras(f.preReservaExpiraEm, -prazo) : null),
  },
  visita_amanha: {
    aplica: (f, agora, fuso) =>
      ABERTOS.includes(f.status) &&
      !!f.visitaEm &&
      diaLocal(f.visitaEm, fuso) >= somarDias(diaLocal(agora, fuso), 1),
    // tarefa criada antes da véspera da visita atual é de uma data antiga (remarcada)
    base: (f, fuso) =>
      f.visitaEm ? instanteLocal(somarDias(diaLocal(f.visitaEm, fuso), -1), '00:00', fuso) : null,
    quando: (f, _prazo, fuso) =>
      f.visitaEm ? instanteLocal(somarDias(diaLocal(f.visitaEm, fuso), -1), '09:00', fuso) : null,
  },
  pos_visita: {
    aplica: (f) =>
      ABERTOS.includes(f.status) && f.status !== 'pre_reservado' && !!f.visitaRealizadaEm,
    base: (f) => f.visitaRealizadaEm,
    quando: (f, _prazo, fuso) =>
      f.visitaRealizadaEm
        ? instanteLocal(somarDias(diaLocal(f.visitaRealizadaEm, fuso), 1), '09:00', fuso)
        : null,
  },
  quente_sem_contato: {
    aplica: (f) =>
      ABERTOS.includes(f.status) &&
      f.status !== 'pre_reservado' &&
      f.temperatura === 'quente' &&
      !!f.quenteDesde &&
      !depois(f.ultimaAcaoVendedorEm, f.quenteDesde),
    base: (f) => f.quenteDesde,
    quando: (f, prazo, fuso) =>
      f.quenteDesde ? proximoHorarioComercial(somarHoras(f.quenteDesde, prazo), fuso) : null,
  },
};

/**
 * O que fazer com a regra neste lead agora.
 * `tarefaCriadaEm`: quando a tarefa mais recente desta regra (aberta ou não) foi criada.
 * 'cancelar' só tem efeito se houver tarefa aberta; 'criar' só se não houver (índice único).
 */
export function avaliarRegra(
  regra: RegraFollowUp,
  f: FatosFollowUp,
  o: { agora: Date; fuso?: string; prazo?: number | null; tarefaCriadaEm?: Date | null },
): Avaliacao {
  const fuso = o.fuso ?? FUSO_PADRAO;
  const r = REGRAS[regra];
  const prazo = o.prazo ?? PRAZOS[regra]?.padrao ?? 0;
  const criada = o.tarefaCriadaEm ?? null;
  if (!r.aplica(f, o.agora, fuso)) return 'cancelar';
  const base = r.base(f, fuso);
  if (criada && base && criada.getTime() < base.getTime()) return 'cancelar';
  const quando = r.quando(f, prazo, fuso);
  if (!quando || o.agora.getTime() < quando.getTime()) return 'nada';
  if (criada && (!base || criada.getTime() >= base.getTime())) return 'nada';
  return 'criar';
}

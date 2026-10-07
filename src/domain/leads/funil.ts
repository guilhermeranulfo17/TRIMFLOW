import { formatInTimeZone } from 'date-fns-tz';
import { hojeNoFuso, somarDias } from '../dates';
import type { StatusLead } from '../publico/status-lead';

/*
 * Funil de leads (Etapa 13): as mesmas negociações da caixa, em colunas. A etapa é derivada do
 * status do lead e do orçamento vigente; nada é gravado. ESPELHO de public._funil_etapa (migration
 * 20261018000001), com teste de equivalência: mudou uma, mude a outra.
 *
 * Mover um card nunca troca o status direto: cada movimento vira a ação de verdade (registrar
 * contato, fazer o orçamento, pré-reservar, confirmar na Agenda, marcar perdido ou reabrir).
 */

export const ETAPAS_FUNIL = ['novo', 'conversa', 'proposta', 'pre_reserva', 'reservado'] as const;
export type EtapaAberta = (typeof ETAPAS_FUNIL)[number];
/** "perdido" junta perdidos, frios e cancelados (faixa recolhida no fim). */
export type EtapaFunil = EtapaAberta | 'perdido';

export const ROTULO_ETAPA: Record<EtapaFunil, string> = {
  novo: 'Novo',
  conversa: 'Em conversa',
  proposta: 'Proposta',
  pre_reserva: 'Pré-reserva',
  reservado: 'Reservado',
  perdido: 'Perdidos e frios',
};

export type StatusOrcamento =
  'em_montagem' | 'enviado' | 'visualizado' | 'substituido' | 'aceito' | 'expirado';

export const STATUS_ORCAMENTO: StatusOrcamento[] = [
  'em_montagem',
  'enviado',
  'visualizado',
  'substituido',
  'aceito',
  'expirado',
];

/**
 * Etapa do lead. `orcamento` é o status do orçamento vigente mais recente (null sem orçamento).
 * Realizado não entra no funil (a festa já aconteceu: está em Clientes).
 */
export function etapaDoFunil(
  status: StatusLead,
  orcamento: StatusOrcamento | null,
): EtapaFunil | null {
  switch (status) {
    case 'novo':
    case 'abandonou':
      return 'novo';
    case 'em_andamento':
      return orcamento === 'enviado' || orcamento === 'visualizado' ? 'proposta' : 'conversa';
    case 'pre_reservado':
      return 'pre_reserva';
    case 'reservado':
      return 'reservado';
    case 'frio':
    case 'perdido':
    case 'cancelado':
      return 'perdido';
    case 'realizado':
      return null;
  }
}

export type CartaoFunil = {
  id: string;
  status: StatusLead;
  etapa: EtapaFunil;
  /** orçamento vigente que dá para pré-reservar (enviado ou visualizado, fora do teste) */
  orcamentoParaReservar: string | null;
  temOrcamento: boolean;
};

export type AcaoMovimento =
  | { tipo: 'nada' }
  | { tipo: 'contato' }
  | { tipo: 'perder' }
  | { tipo: 'reabrir' }
  | { tipo: 'pre_reservar'; orcamentoId: string }
  | { tipo: 'ir'; href: string; aviso: string }
  | { tipo: 'bloqueado'; mensagem: string };

const ORDEM: Record<EtapaFunil, number> = {
  novo: 0,
  conversa: 1,
  proposta: 2,
  pre_reserva: 3,
  reservado: 4,
  perdido: 9,
};

/** O que acontece quando o card vai para `para`. */
export function acaoDoMovimento(c: CartaoFunil, para: EtapaFunil): AcaoMovimento {
  const de = c.etapa;
  if (de === para) return { tipo: 'nada' };
  const lead = `/app/leads/${c.id}`;
  const novoOrcamento = `/app/orcamentos/novo?lead=${c.id}`;

  if (para === 'perdido') {
    if (de === 'reservado') {
      return {
        tipo: 'bloqueado',
        mensagem: 'Reserva confirmada não vira perdida. Cancele a reserva na Agenda.',
      };
    }
    return { tipo: 'perder' };
  }
  if (para === 'novo') {
    return { tipo: 'bloqueado', mensagem: 'Um lead não volta a ser novo.' };
  }

  if (de === 'perdido') {
    if (para !== 'conversa') {
      return { tipo: 'bloqueado', mensagem: 'Primeiro traga o lead de volta para Em conversa.' };
    }
    if (c.status === 'perdido') return { tipo: 'reabrir' };
    if (c.status === 'frio') return { tipo: 'contato' };
    return {
      tipo: 'ir',
      href: novoOrcamento,
      aviso: 'A reserva foi cancelada. Faça um orçamento novo.',
    };
  }
  if (de === 'reservado') {
    return {
      tipo: 'bloqueado',
      mensagem: 'A reserva está confirmada. Para mudar, cancele a reserva na Agenda.',
    };
  }
  if (ORDEM[para] < ORDEM[de]) {
    if (de === 'pre_reserva') {
      return {
        tipo: 'ir',
        href: `${lead}#titulo-reserva`,
        aviso: 'Para voltar, cancele a pré-reserva no lead.',
      };
    }
    return {
      tipo: 'bloqueado',
      mensagem: 'O lead anda sozinho para trás quando a proposta vence ou a pré-reserva cai.',
    };
  }

  switch (para) {
    case 'conversa':
      return { tipo: 'contato' };
    case 'proposta':
      return c.temOrcamento
        ? {
            tipo: 'ir',
            href: `${lead}#titulo-orcamentos`,
            aviso: 'Envie a proposta para o cliente.',
          }
        : { tipo: 'ir', href: novoOrcamento, aviso: 'Monte a proposta para o cliente.' };
    case 'pre_reserva':
      return c.orcamentoParaReservar
        ? { tipo: 'pre_reservar', orcamentoId: c.orcamentoParaReservar }
        : {
            tipo: 'ir',
            href: c.temOrcamento ? `${lead}#titulo-orcamentos` : novoOrcamento,
            aviso: 'A pré-reserva sai de uma proposta. Monte ou atualize o orçamento primeiro.',
          };
    case 'reservado':
      return de === 'pre_reserva'
        ? { tipo: 'ir', href: `${lead}#titulo-reserva`, aviso: 'Confirme o sinal para reservar.' }
        : {
            tipo: 'bloqueado',
            mensagem: 'Primeiro a pré-reserva: a reserva é confirmada com o sinal.',
          };
  }
}

/** Para onde o card pode ir pelo "Mover para" (todas menos a atual e as bloqueadas). */
export function destinosDoCard(c: CartaoFunil): EtapaFunil[] {
  return ([...ETAPAS_FUNIL, 'perdido'] as EtapaFunil[]).filter((e) => {
    const a = acaoDoMovimento(c, e);
    return a.tipo !== 'nada' && a.tipo !== 'bloqueado';
  });
}

/** Próximo passo do card: "Atrasada: Ligar", "Hoje 14h: Ligar", "Amanhã: Ligar", "18/10: Ligar". */
export function proximoPasso(
  tarefa: { titulo: string; vence: Date } | null,
  agora: Date,
  fuso: string,
): { texto: string; atrasado: boolean } | null {
  if (!tarefa) return null;
  if (tarefa.vence < agora) return { texto: `Atrasada: ${tarefa.titulo}`, atrasado: true };
  const hoje = hojeNoFuso(fuso, agora);
  const dia = formatInTimeZone(tarefa.vence, fuso, 'yyyy-MM-dd');
  const hora = formatInTimeZone(tarefa.vence, fuso, "HH'h'mm").replace(/h00$/, 'h');
  const quando =
    dia === hoje
      ? `Hoje ${hora}`
      : dia === somarDias(hoje, 1)
        ? 'Amanhã'
        : `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  return { texto: `${quando}: ${tarefa.titulo}`, atrasado: false };
}

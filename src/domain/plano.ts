import { formatData } from './dates';
import type { Situacao } from './cobranca/situacao';

/** Situação do plano da empresa (empresas.plano) para a tela Plano e a faixa do painel. */

export type Plano = Situacao;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias inteiros que faltam para o fim do teste (arredonda para cima; nunca negativo). */
export function diasRestantesTeste(trialAte: Date | null, agora: Date = new Date()): number {
  if (!trialAte) return 0;
  return Math.max(0, Math.ceil((trialAte.getTime() - agora.getTime()) / DIA_MS));
}

export function rotuloPlano(plano: Plano, diasRestantes: number): string {
  if (plano === 'ativo') return 'Assinatura ativa';
  if (plano === 'suspenso') return 'Acesso suspenso';
  if (plano === 'inadimplente') return 'Pagamento em atraso';
  if (plano === 'cancelado') return 'Assinatura cancelada';
  if (diasRestantes === 0) return 'Teste grátis encerrado';
  return diasRestantes === 1
    ? 'Teste grátis: falta 1 dia'
    : `Teste grátis: faltam ${diasRestantes} dias`;
}

/** A faixa do teste aparece nos últimos dias. */
export const DIAS_FAIXA_TESTE = 5;

export type FaixaConta = {
  tipo: 'teste' | 'inadimplente' | 'suspenso' | 'cancelado';
  texto: string;
  acao: string;
};

/** Faixa global do painel (null = nada a avisar). */
export function faixaDaConta(o: {
  plano: Plano;
  trialAte: Date | null;
  /** yyyy-MM-dd: primeiro dia sem acesso (inadimplente) */
  suspendeEm?: string | null;
  /** yyyy-MM-dd: fim do período pago (cancelado) */
  pagoAte?: string | null;
  agora?: Date;
}): FaixaConta | null {
  const agora = o.agora ?? new Date();
  switch (o.plano) {
    case 'trial': {
      const dias = diasRestantesTeste(o.trialAte, agora);
      if (dias > DIAS_FAIXA_TESTE) return null;
      return {
        tipo: 'teste',
        texto:
          dias <= 1
            ? 'Seu teste grátis acaba hoje. Assine para continuar recebendo pedidos pelo link.'
            : `Seu teste grátis acaba em ${dias} dias. Assine para não parar de receber pedidos.`,
        acao: 'Assinar',
      };
    }
    case 'inadimplente':
      return {
        tipo: 'inadimplente',
        texto: o.suspendeEm
          ? `Não identificamos seu pagamento. A conta fica somente leitura em ${formatData(o.suspendeEm)}.`
          : 'Não identificamos seu pagamento. Pague para não perder o acesso.',
        acao: 'Pagar agora',
      };
    case 'suspenso':
      return {
        tipo: 'suspenso',
        texto:
          'Conta suspensa: o painel está somente leitura e o link mostra só a vitrine. Assine ou pague para voltar.',
        acao: 'Regularizar',
      };
    case 'cancelado':
      return o.pagoAte
        ? {
            tipo: 'cancelado',
            texto: `Assinatura cancelada. Você usa normalmente até ${formatData(o.pagoAte)}.`,
            acao: 'Assinar de novo',
          }
        : null;
    default:
      return null;
  }
}

import { type DataCivil, diasEntre, hojeNoFuso, somarDias } from '../dates';

/*
 * Situação da conta (status em empresas.plano). ESPELHO de public._situacao_conta, com teste de
 * equivalência: mudou uma, mude a outra.
 *
 *   trial ──(pagou)──▶ ativo ──(venceu sem pagar)──▶ inadimplente (até 7 dias) ──▶ suspenso
 *     │                  ▲                                                          │
 *     └──(teste acabou)──┼──────────────────────────────▶ suspenso ◀───────────────┘
 *                        └──────────────────(pagou)─────────────────────────────────┘
 *   cancelado: mantém o acesso até o fim do período pago (pago_ate), depois suspenso.
 *
 * Precedência: suspensão manual (/interno) > cortesia (isenta) > período pago > atraso > teste.
 */

export const SITUACOES = ['trial', 'ativo', 'inadimplente', 'cancelado', 'suspenso'] as const;
export type Situacao = (typeof SITUACOES)[number];

/** Dias de carência depois do vencimento antes de suspender. */
export const DIAS_CARENCIA = 7;

export type StatusAssinatura = 'pendente' | 'ativa' | 'cancelada';

export type AssinaturaSituacao = {
  status: StatusAssinatura;
  /** último dia coberto por pagamento (yyyy-MM-dd) */
  pagoAte: DataCivil | null;
  /** vencimento da cobrança mais antiga em atraso (yyyy-MM-dd) */
  atrasadaDesde: DataCivil | null;
};

export type EntradaSituacao = {
  agora: Date;
  fuso: string;
  trialAte: Date | null;
  isenta: boolean;
  suspensaManual: boolean;
  /** a vigente (não cancelada) ou, sem ela, a cancelada mais recente */
  assinatura: AssinaturaSituacao | null;
};

/** Primeiro dia em atraso: o vencimento atrasado mais antigo ou o dia seguinte ao período pago. */
function inicioDoAtraso(a: AssinaturaSituacao): DataCivil | null {
  if (a.atrasadaDesde) return a.atrasadaDesde;
  return a.pagoAte ? somarDias(a.pagoAte, 1) : null;
}

export function situacaoConta(e: EntradaSituacao): Situacao {
  if (e.suspensaManual) return 'suspenso';
  if (e.isenta) return 'ativo';
  const hoje = hojeNoFuso(e.fuso, e.agora);
  const a = e.assinatura;

  if (a?.pagoAte && hoje <= a.pagoAte) {
    return a.status === 'cancelada' ? 'cancelado' : 'ativo';
  }
  if (a?.status === 'ativa' && a.pagoAte) {
    const inicio = inicioDoAtraso(a)!;
    const atraso = diasEntre(inicio, hoje);
    if (atraso <= 0) return 'ativo';
    return atraso <= DIAS_CARENCIA ? 'inadimplente' : 'suspenso';
  }
  if (e.trialAte && e.agora.getTime() < e.trialAte.getTime()) return 'trial';
  return 'suspenso';
}

/** Dia em que a conta inadimplente será suspensa (o primeiro dia sem acesso). */
export function suspensaoPrevista(a: AssinaturaSituacao | null): DataCivil | null {
  if (!a || a.status !== 'ativa') return null;
  const inicio = inicioDoAtraso(a);
  return inicio ? somarDias(inicio, DIAS_CARENCIA + 1) : null;
}

/** Suspensa = painel somente leitura (exportar e pagar continuam). */
export function podeEscrever(s: Situacao): boolean {
  return s !== 'suspenso';
}

/** Conta com acesso pago ou em teste (o link público funciona por inteiro). */
export function temAcesso(s: Situacao): boolean {
  return s !== 'suspenso';
}

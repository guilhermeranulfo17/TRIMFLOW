import { dividirArredondando } from '../money';
import type { Situacao } from './situacao';

/*
 * Números do /interno: MRR, pagantes, testes ativos, conversão teste → pago e cancelamentos.
 */

export type AssinaturaMrr = {
  status: 'pendente' | 'ativa' | 'cancelada';
  ciclo: 'mensal' | 'anual';
  valorCentavos: number;
};

/** Receita mensal recorrente da assinatura (anual ÷ 12). Só conta assinatura ativa. */
export function mrrDaAssinatura(a: AssinaturaMrr | null): number {
  if (!a || a.status !== 'ativa') return 0;
  return a.ciclo === 'anual' ? dividirArredondando(a.valorCentavos, 12) : a.valorCentavos;
}

export type EmpresaResumo = {
  situacao: Situacao;
  trialAte: Date | null;
  isenta: boolean;
  /** já teve algum pagamento confirmado */
  pagou: boolean;
  assinatura: AssinaturaMrr | null;
  cancelamentoMotivo: string | null;
};

export type ResumoInterno = {
  mrrCentavos: number;
  pagantes: number;
  testesAtivos: number;
  /** pagou / teste encerrado (basis points; null sem base) */
  conversaoBp: number | null;
  cancelamentos: { motivo: string; quantidade: number }[];
};

export function resumoInterno(empresas: EmpresaResumo[], agora: Date): ResumoInterno {
  const pagantes = empresas.filter((e) => !e.isenta && mrrDaAssinatura(e.assinatura) > 0);
  const encerrados = empresas.filter(
    (e) =>
      !e.isenta && (e.pagou || (e.trialAte !== null && e.trialAte.getTime() <= agora.getTime())),
  );
  const motivos = new Map<string, number>();
  for (const e of empresas) {
    if (e.cancelamentoMotivo)
      motivos.set(e.cancelamentoMotivo, (motivos.get(e.cancelamentoMotivo) ?? 0) + 1);
  }
  return {
    mrrCentavos: pagantes.reduce((s, e) => s + mrrDaAssinatura(e.assinatura), 0),
    pagantes: pagantes.length,
    testesAtivos: empresas.filter((e) => e.situacao === 'trial').length,
    conversaoBp:
      encerrados.length === 0
        ? null
        : dividirArredondando(encerrados.filter((e) => e.pagou).length * 10_000, encerrados.length),
    cancelamentos: [...motivos.entries()]
      .map(([motivo, quantidade]) => ({ motivo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || a.motivo.localeCompare(b.motivo)),
  };
}

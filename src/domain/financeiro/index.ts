import { compararDatas, somarDias, type DataCivil } from '../dates';
import { calcularParcelas } from '../preco/parcelas';

/*
 * Financeiro da festa (Etapa 11): o plano (sinal e parcelas) e os recebimentos de cada reserva.
 * O banco só guarda os fatos; aqui se calcula o que está pago, atrasado e a receber. Os
 * recebimentos quitam as parcelas em ordem de vencimento (o mais antigo primeiro).
 * Dinheiro sempre em centavos inteiros.
 */

export const FORMAS_PAGAMENTO = [
  'pix',
  'dinheiro',
  'cartao_credito',
  'cartao_debito',
  'boleto',
  'transferencia',
  'outro',
] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  outro: 'Outro',
};

export type ParcelaPlano = { descricao: string; valorCentavos: number; venceEm: DataCivil };
export type Recebimento = { valorCentavos: number; recebidoEm: DataCivil; estornado: boolean };

export type StatusParcela = 'paga' | 'parcial' | 'vencida' | 'aberta';

export type ParcelaSituacao = ParcelaPlano & {
  status: StatusParcela;
  pagoCentavos: number;
  faltaCentavos: number;
};

export type StatusFinanceiro = 'sem_plano' | 'quitado' | 'atrasado' | 'em_dia';

export type SituacaoFinanceira = {
  status: StatusFinanceiro;
  totalCentavos: number;
  recebidoCentavos: number;
  /** total menos recebido (nunca negativo) */
  saldoCentavos: number;
  /** recebido além do total (troco ou erro de lançamento) */
  sobraCentavos: number;
  atrasadoCentavos: number;
  parcelas: ParcelaSituacao[];
  /** a primeira parcela que ainda falta (vencida ou não) */
  proxima: ParcelaSituacao | null;
};

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Situação de uma festa. Sem plano, o total é o valor da reserva (se houver) e nada vence:
 * só mostra o recebido e o saldo, com status "sem_plano".
 */
export function situacaoFinanceira(
  plano: ParcelaPlano[],
  recebimentos: Recebimento[],
  hoje: DataCivil,
  totalSemPlanoCentavos: number | null = null,
): SituacaoFinanceira {
  const recebido = soma(recebimentos.filter((r) => !r.estornado).map((r) => r.valorCentavos));
  const ordenadas = [...plano].sort((a, b) => compararDatas(a.venceEm, b.venceEm));
  let disponivel = recebido;
  const parcelas: ParcelaSituacao[] = ordenadas.map((p) => {
    const pago = Math.min(disponivel, p.valorCentavos);
    disponivel -= pago;
    const falta = p.valorCentavos - pago;
    const status: StatusParcela =
      falta === 0
        ? 'paga'
        : compararDatas(p.venceEm, hoje) < 0
          ? 'vencida'
          : pago > 0
            ? 'parcial'
            : 'aberta';
    return { ...p, status, pagoCentavos: pago, faltaCentavos: falta };
  });
  const total = plano.length
    ? soma(plano.map((p) => p.valorCentavos))
    : (totalSemPlanoCentavos ?? 0);
  const atrasado = soma(parcelas.filter((p) => p.status === 'vencida').map((p) => p.faltaCentavos));
  const saldo = Math.max(0, total - recebido);
  const status: StatusFinanceiro = !plano.length
    ? total > 0 && saldo === 0
      ? 'quitado'
      : 'sem_plano'
    : saldo === 0
      ? 'quitado'
      : atrasado > 0
        ? 'atrasado'
        : 'em_dia';
  return {
    status,
    totalCentavos: total,
    recebidoCentavos: recebido,
    saldoCentavos: saldo,
    sobraCentavos: Math.max(0, recebido - total),
    atrasadoCentavos: atrasado,
    parcelas,
    proxima: parcelas.find((p) => p.faltaCentavos > 0) ?? null,
  };
}

/**
 * Plano sugerido: o sinal (vence hoje, ou na data em que foi pago) e o saldo nas parcelas das
 * regras do buffet (o mesmo calcularParcelas do orçamento).
 */
export function sugerirPlano(d: {
  totalCentavos: number;
  sinalCentavos: number | null;
  sinalPagoEm: DataCivil | null;
  dataFesta: DataCivil;
  hoje: DataCivil;
  parcelasMax: number;
  prazoUltimaParcelaDias: number;
}): ParcelaPlano[] {
  const sinal = Math.min(Math.max(0, d.sinalCentavos ?? 0), d.totalCentavos);
  const saldo = d.totalCentavos - sinal;
  const plano: ParcelaPlano[] = [];
  if (sinal > 0) {
    plano.push({ descricao: 'Sinal', valorCentavos: sinal, venceEm: d.sinalPagoEm ?? d.hoje });
  }
  const { parcelas } = calcularParcelas(
    saldo,
    d.dataFesta,
    d.hoje,
    d.parcelasMax,
    d.prazoUltimaParcelaDias,
  );
  const n = parcelas.length;
  for (const p of parcelas) {
    plano.push({
      descricao: n === 1 ? 'Saldo' : `Parcela ${p.numero} de ${n}`,
      valorCentavos: p.valorCentavos,
      venceEm: p.vencimento,
    });
  }
  return plano;
}

export type ErroPlano = 'vazio' | 'muitas' | 'valor' | 'descricao' | 'data';

/** Confere o plano antes de salvar (o banco confere de novo). */
export function validarPlano(plano: ParcelaPlano[]): ErroPlano | null {
  if (plano.length === 0) return 'vazio';
  if (plano.length > 24) return 'muitas';
  for (const p of plano) {
    if (
      !Number.isSafeInteger(p.valorCentavos) ||
      p.valorCentavos <= 0 ||
      p.valorCentavos > 100_000_000
    )
      return 'valor';
    if (!p.descricao.trim() || p.descricao.trim().length > 80) return 'descricao';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.venceEm)) return 'data';
  }
  return null;
}

export const MENSAGEM_ERRO_PLANO: Record<ErroPlano, string> = {
  vazio: 'Inclua pelo menos uma parcela.',
  muitas: 'No máximo 24 parcelas.',
  valor: 'Toda parcela precisa de um valor maior que zero.',
  descricao: 'Dê um nome a cada parcela (ex.: Sinal, Parcela 1).',
  data: 'Confira as datas de vencimento.',
};

/**
 * Antes de montar o plano, o sinal marcado como pago na Agenda conta como recebido (ao salvar o
 * plano pela primeira vez, o banco grava esse recebimento de verdade: salvar_plano_pagamento).
 */
export function recebimentosComSinalDaAgenda(
  recebimentos: Recebimento[],
  temPlano: boolean,
  sinal: { centavos: number | null; pagoEm: DataCivil | null },
): Recebimento[] {
  if (
    temPlano ||
    recebimentos.length > 0 ||
    !sinal.pagoEm ||
    !sinal.centavos ||
    sinal.centavos <= 0
  )
    return recebimentos;
  return [{ valorCentavos: sinal.centavos, recebidoEm: sinal.pagoEm, estornado: false }];
}

// ---------------------------------------------------------------------------------------------
// Tela do Financeiro: filtros e resumo do período
// ---------------------------------------------------------------------------------------------

export const FILTROS_FINANCEIRO = [
  'abertos',
  'atrasados',
  'proximos',
  'quitados',
  'todos',
] as const;
export type FiltroFinanceiro = (typeof FILTROS_FINANCEIRO)[number];

export const ROTULO_FILTRO_FINANCEIRO: Record<FiltroFinanceiro, string> = {
  abertos: 'A receber',
  atrasados: 'Atrasados',
  proximos: 'Vence em 30 dias',
  quitados: 'Quitados',
  todos: 'Todos',
};

export function filtroFinanceiroDaUrl(v: string | string[] | undefined): FiltroFinanceiro {
  const s = Array.isArray(v) ? v[0] : v;
  return (FILTROS_FINANCEIRO as readonly string[]).includes(s ?? '')
    ? (s as FiltroFinanceiro)
    : 'abertos';
}

/** A festa entra no filtro? */
export function noFiltro(s: SituacaoFinanceira, f: FiltroFinanceiro, hoje: DataCivil): boolean {
  switch (f) {
    case 'todos':
      return true;
    case 'quitados':
      return s.status === 'quitado';
    case 'atrasados':
      return s.status === 'atrasado';
    case 'abertos':
      return s.saldoCentavos > 0;
    case 'proximos': {
      const limite = somarDias(hoje, 30);
      return s.parcelas.some(
        (p) =>
          p.faltaCentavos > 0 &&
          compararDatas(p.venceEm, hoje) >= 0 &&
          compararDatas(p.venceEm, limite) <= 0,
      );
    }
  }
}

export type ResumoFinanceiro = {
  /** recebimentos válidos com data no mês corrente */
  recebidoNoMesCentavos: number;
  /** parcelas (o que falta delas) vencendo de hoje a hoje + 30 */
  aReceber30DiasCentavos: number;
  atrasadoCentavos: number;
  /** saldo de todas as festas em aberto */
  saldoTotalCentavos: number;
};

export function resumoFinanceiro(
  festas: { situacao: SituacaoFinanceira; recebimentos: Recebimento[] }[],
  hoje: DataCivil,
): ResumoFinanceiro {
  const mes = hoje.slice(0, 7);
  const limite = somarDias(hoje, 30);
  let recebidoNoMes = 0;
  let aReceber = 0;
  let atrasado = 0;
  let saldo = 0;
  for (const f of festas) {
    recebidoNoMes += soma(
      f.recebimentos
        .filter((r) => !r.estornado && r.recebidoEm.slice(0, 7) === mes)
        .map((r) => r.valorCentavos),
    );
    atrasado += f.situacao.atrasadoCentavos;
    saldo += f.situacao.saldoCentavos;
    aReceber += soma(
      f.situacao.parcelas
        .filter(
          (p) =>
            p.faltaCentavos > 0 &&
            compararDatas(p.venceEm, hoje) >= 0 &&
            compararDatas(p.venceEm, limite) <= 0,
        )
        .map((p) => p.faltaCentavos),
    );
  }
  return {
    recebidoNoMesCentavos: recebidoNoMes,
    aReceber30DiasCentavos: aReceber,
    atrasadoCentavos: atrasado,
    saldoTotalCentavos: saldo,
  };
}

export const ROTULO_STATUS_FINANCEIRO: Record<StatusFinanceiro, string> = {
  sem_plano: 'Sem plano',
  quitado: 'Quitado',
  atrasado: 'Atrasado',
  em_dia: 'Em dia',
};

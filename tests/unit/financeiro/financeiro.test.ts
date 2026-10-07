import { describe, expect, it } from 'vitest';
import {
  filtroFinanceiroDaUrl,
  noFiltro,
  resumoFinanceiro,
  situacaoFinanceira,
  sugerirPlano,
  validarPlano,
  type ParcelaPlano,
} from '@/domain/financeiro';

const HOJE = '2026-10-15';
const PLANO: ParcelaPlano[] = [
  { descricao: 'Sinal', valorCentavos: 150000, venceEm: '2026-09-10' },
  { descricao: 'Parcela 1 de 2', valorCentavos: 175000, venceEm: '2026-10-10' },
  { descricao: 'Parcela 2 de 2', valorCentavos: 175000, venceEm: '2026-11-10' },
];
const rec = (valorCentavos: number, recebidoEm = '2026-09-10', estornado = false) => ({
  valorCentavos,
  recebidoEm,
  estornado,
});

describe('situacaoFinanceira', () => {
  it('quita em ordem de vencimento: sinal pago, parcela 1 vencida, parcela 2 aberta', () => {
    const s = situacaoFinanceira(PLANO, [rec(150000)], HOJE);
    expect(s.status).toBe('atrasado');
    expect(s.parcelas.map((p) => p.status)).toEqual(['paga', 'vencida', 'aberta']);
    expect(s).toMatchObject({
      totalCentavos: 500000,
      recebidoCentavos: 150000,
      saldoCentavos: 350000,
      atrasadoCentavos: 175000,
    });
    expect(s.proxima?.descricao).toBe('Parcela 1 de 2');
  });

  it('pagamento parcial, estorno não conta e sobra', () => {
    const p = situacaoFinanceira(PLANO, [rec(150000), rec(200000, '2026-10-01')], HOJE);
    expect(p.status).toBe('em_dia');
    expect(p.parcelas.map((x) => [x.status, x.faltaCentavos])).toEqual([
      ['paga', 0],
      ['paga', 0],
      ['parcial', 150000],
    ]);
    const e = situacaoFinanceira(PLANO, [rec(150000), rec(175000, '2026-10-01', true)], HOJE);
    expect(e.recebidoCentavos).toBe(150000);
    const q = situacaoFinanceira(PLANO, [rec(510000)], HOJE);
    expect(q).toMatchObject({ status: 'quitado', saldoCentavos: 0, sobraCentavos: 10000 });
  });

  it('sem plano: usa o total da reserva e não vence nada', () => {
    expect(situacaoFinanceira([], [rec(1000)], HOJE, 5000)).toMatchObject({
      status: 'sem_plano',
      saldoCentavos: 4000,
      atrasadoCentavos: 0,
      proxima: null,
    });
    expect(situacaoFinanceira([], [rec(5000)], HOJE, 5000).status).toBe('quitado');
    expect(situacaoFinanceira([], [], HOJE, null).status).toBe('sem_plano');
  });

  it('vence hoje ainda não é atraso', () => {
    const s = situacaoFinanceira(
      [{ descricao: 'Saldo', valorCentavos: 100, venceEm: HOJE }],
      [],
      HOJE,
    );
    expect(s.status).toBe('em_dia');
    expect(s.parcelas[0]!.status).toBe('aberta');
  });
});

describe('sugerirPlano', () => {
  it('sinal pago na data dele e o saldo nas parcelas das regras', () => {
    const p = sugerirPlano({
      totalCentavos: 500000,
      sinalCentavos: 150000,
      sinalPagoEm: '2026-09-10',
      dataFesta: '2027-01-20',
      hoje: HOJE,
      parcelasMax: 3,
      prazoUltimaParcelaDias: 7,
    });
    expect(p[0]).toEqual({ descricao: 'Sinal', valorCentavos: 150000, venceEm: '2026-09-10' });
    expect(p.slice(1).map((x) => x.descricao)).toEqual([
      'Parcela 1 de 3',
      'Parcela 2 de 3',
      'Parcela 3 de 3',
    ]);
    expect(p.reduce((a, b) => a + b.valorCentavos, 0)).toBe(500000);
    expect(p.at(-1)!.venceEm).toBe('2027-01-13');
  });

  it('sem sinal e festa perto: um saldo só; sinal maior que o total é limitado', () => {
    const p = sugerirPlano({
      totalCentavos: 100000,
      sinalCentavos: null,
      sinalPagoEm: null,
      dataFesta: '2026-10-18',
      hoje: HOJE,
      parcelasMax: 3,
      prazoUltimaParcelaDias: 7,
    });
    expect(p).toEqual([{ descricao: 'Saldo', valorCentavos: 100000, venceEm: HOJE }]);
    const s = sugerirPlano({
      totalCentavos: 1000,
      sinalCentavos: 5000,
      sinalPagoEm: null,
      dataFesta: '2027-01-20',
      hoje: HOJE,
      parcelasMax: 3,
      prazoUltimaParcelaDias: 7,
    });
    expect(s).toEqual([{ descricao: 'Sinal', valorCentavos: 1000, venceEm: HOJE }]);
  });
});

describe('validarPlano, filtros e resumo', () => {
  it('valida', () => {
    expect(validarPlano(PLANO)).toBeNull();
    expect(validarPlano([])).toBe('vazio');
    expect(validarPlano([{ ...PLANO[0]!, valorCentavos: 0 }])).toBe('valor');
    expect(validarPlano([{ ...PLANO[0]!, descricao: ' ' }])).toBe('descricao');
    expect(validarPlano([{ ...PLANO[0]!, venceEm: '10/10/2026' }])).toBe('data');
  });

  it('filtros', () => {
    expect(filtroFinanceiroDaUrl('atrasados')).toBe('atrasados');
    expect(filtroFinanceiroDaUrl('x')).toBe('abertos');
    const atrasada = situacaoFinanceira(PLANO, [rec(150000)], HOJE);
    const quitada = situacaoFinanceira(PLANO, [rec(500000)], HOJE);
    expect(noFiltro(atrasada, 'atrasados', HOJE)).toBe(true);
    expect(noFiltro(atrasada, 'abertos', HOJE)).toBe(true);
    expect(noFiltro(quitada, 'abertos', HOJE)).toBe(false);
    expect(noFiltro(quitada, 'quitados', HOJE)).toBe(true);
    // a parcela 2 vence em 26 dias
    expect(noFiltro(atrasada, 'proximos', HOJE)).toBe(true);
    expect(noFiltro(atrasada, 'proximos', '2026-08-01')).toBe(false);
  });

  it('resumo do período', () => {
    const r1 = [rec(150000, '2026-09-10'), rec(50000, '2026-10-02'), rec(9999, '2026-10-03', true)];
    const r2 = [rec(500000, '2026-10-05')];
    const r = resumoFinanceiro(
      [
        { situacao: situacaoFinanceira(PLANO, r1, HOJE), recebimentos: r1 },
        { situacao: situacaoFinanceira(PLANO, r2, HOJE), recebimentos: r2 },
      ],
      HOJE,
    );
    expect(r).toEqual({
      recebidoNoMesCentavos: 550000,
      aReceber30DiasCentavos: 175000,
      atrasadoCentavos: 125000,
      saldoTotalCentavos: 300000,
    });
  });
});

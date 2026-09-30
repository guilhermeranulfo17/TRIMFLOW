import { describe, expect, it } from 'vitest';
import { calcularOrcamento } from '@/domain/preco';
import { calcularParcelas } from '@/domain/preco/parcelas';
import { contextoBase, entradaSimples } from './fixture';

describe('parcelas do saldo', () => {
  it('3 parcelas mensais com o resto na primeira', () => {
    const { parcelas, prazoCurto } = calcularParcelas(100000, '2027-03-20', '2026-09-30', 3, 7);
    expect(prazoCurto).toBe(false);
    expect(parcelas).toEqual([
      { numero: 1, valorCentavos: 33334, vencimento: '2027-01-13' },
      { numero: 2, valorCentavos: 33333, vencimento: '2027-02-13' },
      { numero: 3, valorCentavos: 33333, vencimento: '2027-03-13' },
    ]);
    expect(parcelas.reduce((s, p) => s + p.valorCentavos, 0)).toBe(100000);
  });

  it('prazo curto reduz o número de parcelas', () => {
    const { parcelas } = calcularParcelas(90001, '2026-11-20', '2026-09-30', 6, 7);
    expect(parcelas.map((p) => p.vencimento)).toEqual(['2026-10-13', '2026-11-13']);
    expect(parcelas.map((p) => p.valorCentavos)).toEqual([45001, 45000]);
  });

  it('primeira parcela pode vencer hoje', () => {
    const { parcelas } = calcularParcelas(300, '2026-12-07', '2026-10-30', 3, 7);
    expect(parcelas.map((p) => p.vencimento)).toEqual(['2026-10-30', '2026-11-30']);
  });

  it('sem tempo nem para a última: 1 parcela hoje e aviso', () => {
    const plano = calcularParcelas(5000, '2026-10-03', '2026-09-30', 3, 7);
    expect(plano).toEqual({
      parcelas: [{ numero: 1, valorCentavos: 5000, vencimento: '2026-09-30' }],
      prazoCurto: true,
    });
  });

  it('última parcela no fim do mês ajusta os meses curtos', () => {
    const { parcelas } = calcularParcelas(3, '2027-04-07', '2026-12-01', 3, 7);
    expect(parcelas.map((p) => p.vencimento)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('saldo zero, sem parcelas; parcelasMax 1 = à vista', () => {
    expect(calcularParcelas(0, '2027-01-01', '2026-09-30', 3, 7).parcelas).toEqual([]);
    expect(calcularParcelas(100, '2027-01-01', '2026-09-30', 1, 7).parcelas).toEqual([
      { numero: 1, valorCentavos: 100, vencimento: '2026-12-25' },
    ]);
  });

  it('o motor avisa quando o prazo é curto (canal interno, data próxima)', () => {
    const r = calcularOrcamento(
      contextoBase(),
      entradaSimples({ canal: 'interno', data: '2026-10-02' }),
    );
    expect(r.avisos.map((a) => a.codigo)).toEqual(['ANTECEDENCIA_MINIMA', 'PRAZO_PARCELAS_CURTO']);
    expect(r.parcelas).toHaveLength(1);
  });

  it('data inválida não gera parcelas', () => {
    const r = calcularOrcamento(contextoBase(), entradaSimples({ data: 'x' }));
    expect(r.parcelas).toEqual([]);
  });
});

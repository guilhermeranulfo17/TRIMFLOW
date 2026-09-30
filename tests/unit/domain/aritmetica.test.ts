import { describe, expect, it } from 'vitest';
import {
  compararDatas,
  dataCivilValida,
  diaDaSemanaNumero,
  somarDias,
  somarMeses,
} from '@/domain/dates';
import { dividirArredondando, pctBp } from '@/domain/money';
import { formatBp } from '@/domain/percent';

describe('pctBp', () => {
  it.each([
    [577500, 1000, 57750],
    [740250, 500, 37013], // 37012,5 → 37013
    [703237, 3000, 210971],
    [577500, -1500, -86625],
    [1, 5000, 1], // 0,5 → 1
    [-1, 5000, -1],
    [1, 4999, 0],
    [0, 3000, 0],
    [703237, 0, 0],
    [703237, 10000, 703237],
    [100, 20000, 200],
  ])('pctBp(%i, %i) = %i', (cents, bp, esperado) => {
    expect(pctBp(cents, bp)).toBe(esperado);
  });

  it('recusa valores não inteiros', () => {
    expect(() => pctBp(10.5, 100)).toThrow(TypeError);
    expect(() => pctBp(100, 10.5)).toThrow(TypeError);
  });
});

describe('dividirArredondando', () => {
  it.each([
    [703237, 65, 10819], // 10819,03
    [100, 3, 33],
    [200, 3, 67], // 66,67
    [5, 2, 3], // 2,5 → 3
    [-5, 2, -3],
    [0, 7, 0],
  ])('%i / %i = %i', (cents, d, esperado) => {
    expect(dividirArredondando(cents, d)).toBe(esperado);
  });

  it('recusa divisor inválido', () => {
    expect(() => dividirArredondando(100, 0)).toThrow(RangeError);
    expect(() => dividirArredondando(100, 1.5)).toThrow(RangeError);
  });
});

describe('formatBp', () => {
  it.each([
    [1000, '10%'],
    [-1500, '-15%'],
    [1250, '12,5%'],
    [1234, '12,34%'],
    [0, '0%'],
    [5, '0,05%'],
    [10000, '100%'],
    [1000000, '10.000%'],
  ])('%i → %s', (bp, esperado) => {
    expect(formatBp(bp)).toBe(esperado);
  });

  it('sinal explícito para positivos', () => {
    expect(formatBp(1000, { sinal: true })).toBe('+10%');
    expect(formatBp(-1000, { sinal: true })).toBe('-10%');
    expect(formatBp(0, { sinal: true })).toBe('0%');
  });

  it('recusa não inteiros', () => {
    expect(() => formatBp(1.5)).toThrow(TypeError);
  });
});

describe('datas civis', () => {
  it('dia da semana numérico (0 = domingo)', () => {
    expect(diaDaSemanaNumero('2026-11-14')).toBe(6); // sábado
    expect(diaDaSemanaNumero('2026-11-15')).toBe(0);
    expect(diaDaSemanaNumero('2026-11-16')).toBe(1);
  });

  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-11-14', 7)).toBe('2026-11-21');
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(somarDias('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('somarMeses usa o último dia quando o mês é mais curto', () => {
    expect(somarMeses('2026-03-31', -1)).toBe('2026-02-28');
    expect(somarMeses('2026-01-15', -2)).toBe('2025-11-15');
    expect(somarMeses('2026-10-31', 1)).toBe('2026-11-30');
    expect(somarMeses('2026-11-07', 0)).toBe('2026-11-07');
  });

  it('comparar e validar', () => {
    expect(compararDatas('2026-01-01', '2026-01-02')).toBeLessThan(0);
    expect(compararDatas('2026-01-02', '2026-01-02')).toBe(0);
    expect(compararDatas('2026-02-01', '2026-01-31')).toBeGreaterThan(0);
    expect(dataCivilValida('2026-02-29')).toBe(false);
    expect(dataCivilValida('2028-02-29')).toBe(true);
    expect(() => somarDias('2026-13-01', 1)).toThrow(RangeError);
    expect(() => compararDatas('x', '2026-01-01')).toThrow(RangeError);
  });
});

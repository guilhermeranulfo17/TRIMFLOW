import { describe, expect, it } from 'vitest';
import { formatPct } from '@/domain/percent';

describe('formatPct', () => {
  it.each([
    [0.154, '15,4%'],
    [0.15, '15%'],
    [0, '0%'],
    [1, '100%'],
    [0.5, '50%'],
    [0.1234, '12,3%'],
    [0.1235, '12,4%'],
    [0.0005, '0,1%'],
    [0.00049, '0%'],
    [12.345, '1.234,5%'],
    [-0.154, '-15,4%'],
    [0.07, '7%'],
  ])('%d → %s', (razao, esperado) => {
    expect(formatPct(razao)).toBe(esperado);
  });

  it('respeita casas decimais', () => {
    expect(formatPct(0.15456, 2)).toBe('15,46%');
    expect(formatPct(0.154, 0)).toBe('15%');
    expect(formatPct(0.155, 0)).toBe('16%');
    expect(formatPct(0.1501, 2)).toBe('15,01%');
  });

  it('rejeita entradas inválidas', () => {
    expect(() => formatPct(Number.NaN)).toThrow();
    expect(() => formatPct(0.1, 5)).toThrow();
  });
});

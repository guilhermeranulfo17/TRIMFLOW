import { describe, expect, it } from 'vitest';
import { contaForaDasMetricas, incluirContasDeTeste } from '@/domain/interno/contas';

describe('contas fora das métricas (§99)', () => {
  it('demo, apresentação ou cortesia ficam fora; conta normal entra', () => {
    const n = { ehDemo: false, ehApresentacao: false, isenta: false };
    expect(contaForaDasMetricas(n)).toBe(false);
    expect(contaForaDasMetricas({ ...n, ehDemo: true })).toBe(true);
    expect(contaForaDasMetricas({ ...n, ehApresentacao: true })).toBe(true);
    expect(contaForaDasMetricas({ ...n, isenta: true })).toBe(true);
  });

  it('?teste=1 inclui; qualquer outra coisa não', () => {
    expect(incluirContasDeTeste('1')).toBe(true);
    expect(incluirContasDeTeste(['1', '0'])).toBe(true);
    expect(incluirContasDeTeste('0')).toBe(false);
    expect(incluirContasDeTeste(undefined)).toBe(false);
    expect(incluirContasDeTeste('sim')).toBe(false);
  });
});

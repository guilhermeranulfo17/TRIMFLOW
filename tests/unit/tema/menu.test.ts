import { describe, expect, it } from 'vitest';
import { menuRecolhido } from '@/domain/tema';

describe('menuRecolhido', () => {
  it('só recolhe com o valor gravado pelo botão; o padrão é aberto', () => {
    expect(menuRecolhido('recolhido')).toBe(true);
    expect(menuRecolhido('aberto')).toBe(false);
    expect(menuRecolhido(undefined)).toBe(false);
    expect(menuRecolhido('qualquer')).toBe(false);
  });
});

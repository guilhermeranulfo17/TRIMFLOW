import { describe, expect, it } from 'vitest';
import { modoPrecoValido, OPCOES_MODO_PRECO } from '@/domain/onboarding/modo-preco';

describe('modo de exibição do preço no onboarding', () => {
  it('as três escolhas, na ordem: preço, faixa e valor após contato', () => {
    expect(OPCOES_MODO_PRECO.map((o) => o.valor)).toEqual(['exato', 'faixa', 'apos_contato']);
    expect(OPCOES_MODO_PRECO.map((o) => o.titulo)).toEqual([
      'Mostrar o preço',
      'Mostrar uma faixa',
      'Valor após contato',
    ]);
  });

  it('cada uma tem uma frase explicando, sem travessão', () => {
    for (const o of OPCOES_MODO_PRECO) {
      expect(o.frase.length).toBeGreaterThan(20);
      expect(o.titulo + o.frase).not.toMatch(/[—–]/);
    }
  });

  it('valida o valor', () => {
    expect(modoPrecoValido('faixa')).toBe(true);
    expect(modoPrecoValido('sob_consulta')).toBe(false);
  });
});

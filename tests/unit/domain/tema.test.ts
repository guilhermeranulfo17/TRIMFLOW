import { describe, expect, it } from 'vitest';
import { temaValido } from '@/domain/tema';

describe('temaValido', () => {
  it('aceita os três temas', () => {
    expect(temaValido('escuro')).toBe('escuro');
    expect(temaValido('claro')).toBe('claro');
    expect(temaValido('sistema')).toBe('sistema');
  });

  it('qualquer outro valor vira o padrão (escuro)', () => {
    for (const v of [undefined, null, '', 'roxo', 'CLARO', 'claro ']) {
      expect(temaValido(v)).toBe('escuro');
    }
  });
});

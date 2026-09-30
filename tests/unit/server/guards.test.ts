import { describe, expect, it } from 'vitest';
import { AcessoNegadoError, perfilPermitido } from '@/server/auth/guards';

describe('perfilPermitido', () => {
  it('dono passa em exigirPerfil("dono")', () => {
    expect(perfilPermitido('dono', ['dono'])).toBe(true);
  });

  it('vendedor não passa em exigirPerfil("dono")', () => {
    expect(perfilPermitido('vendedor', ['dono'])).toBe(false);
  });

  it('aceita lista de perfis', () => {
    expect(perfilPermitido('vendedor', ['dono', 'vendedor'])).toBe(true);
  });

  it('erro de acesso negado tem mensagem amigável', () => {
    expect(new AcessoNegadoError().message).toBe('Você não tem permissão para fazer isso.');
  });
});

import { describe, expect, it } from 'vitest';
import { modeloPaginaEfetivo, ROTULO_MODELO_PAGINA } from '@/domain/publico/pagina';
import { textosPaginaSchema } from '@/domain/validacao/pagina';

/* Página pública elegante (§84): escolha do modelo da página. */

describe('modelo da página pública', () => {
  it('a escolha da página vale primeiro', () => {
    expect(modeloPaginaEfetivo('elegante', 'alegre', 'infantil')).toBe('elegante');
    expect(modeloPaginaEfetivo('alegre', 'elegante', 'eventos')).toBe('alegre');
  });

  it('sem escolha, o mesmo da proposta', () => {
    expect(modeloPaginaEfetivo(null, 'elegante', 'infantil')).toBe('elegante');
    expect(modeloPaginaEfetivo(undefined, 'alegre', 'eventos')).toBe('alegre');
  });

  it('sem escolha nenhuma, pelo tipo de buffet', () => {
    expect(modeloPaginaEfetivo(null, null, 'infantil')).toBe('alegre');
    expect(modeloPaginaEfetivo(null, null, 'eventos')).toBe('elegante');
    expect(modeloPaginaEfetivo(null, null, 'domicilio')).toBe('elegante');
  });

  it('valor inválido é ignorado', () => {
    expect(modeloPaginaEfetivo('festivo', 'neon', 'infantil')).toBe('alegre');
  });

  it('textos sem travessão', () => {
    for (const r of Object.values(ROTULO_MODELO_PAGINA))
      expect(r.nome + r.descricao).not.toMatch(/[—–]/);
  });

  it('o formulário aceita o modelo (vazio = automático) e recusa outro valor', () => {
    const base = {
      slogan: '',
      estilo: '' as const,
      diferenciais: [],
      bairro: '',
      endereco: '',
      mostrarEndereco: false,
    };
    for (const modelo of ['', 'elegante', 'alegre', undefined])
      expect(textosPaginaSchema.safeParse({ ...base, modelo }).success).toBe(true);
    expect(textosPaginaSchema.safeParse({ ...base, modelo: 'neon' }).success).toBe(false);
  });
});

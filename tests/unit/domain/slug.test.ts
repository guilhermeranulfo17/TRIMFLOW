import { describe, expect, it } from 'vitest';
import { gerarSlug, slugBaseDaEmpresa, slugValido, SLUG_MAX } from '@/domain/slug';

describe('gerarSlug', () => {
  it.each([
    ['Buffet Alegria & Cia', 'buffet-alegria-cia'],
    ['Espaço Mágico Açaí', 'espaco-magico-acai'],
    ['  --Festa__Top!!  ', 'festa-top'],
    ['Buffet São João d’Ávila', 'buffet-sao-joao-d-avila'],
    ['ÁÉÍÓÚ âêô ãõ ç ü', 'aeiou-aeo-ao-c-u'],
    ['Buffet 123', 'buffet-123'],
    ['Festa 🎉 Feliz', 'festa-feliz'],
    ['Bäckerei Straße', 'backerei-strasse'],
    ['Øresund Æble', 'oresund-aeble'],
    ['já-é-slug', 'ja-e-slug'],
    ['!!!', ''],
    ['', ''],
  ])('"%s" → "%s"', (entrada, esperado) => {
    expect(gerarSlug(entrada)).toBe(esperado);
  });

  it('limita a 60 caracteres sem terminar em hífen', () => {
    const slug = gerarSlug(`${'a'.repeat(59)} bbbb`);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).toBe('a'.repeat(59));
  });
});

describe('slugBaseDaEmpresa', () => {
  it('mantém slugs com 3+ caracteres', () => {
    expect(slugBaseDaEmpresa('Buffet Alegria & Cia')).toBe('buffet-alegria-cia');
    expect(slugBaseDaEmpresa('Oba')).toBe('oba');
  });

  it('prefixa nomes curtos', () => {
    expect(slugBaseDaEmpresa('Jó')).toBe('buffet-jo');
    expect(slugBaseDaEmpresa('A')).toBe('buffet-a');
  });

  it('usa "buffet" quando nada sobra', () => {
    expect(slugBaseDaEmpresa('🎈🎈')).toBe('buffet');
  });

  it('resultado sempre é válido', () => {
    for (const nome of ['X', 'Buffet Alegria', '***', 'Ç', 'a'.repeat(100)]) {
      expect(slugValido(slugBaseDaEmpresa(nome))).toBe(true);
    }
  });
});

describe('slugValido', () => {
  it.each([
    ['buffet-demo', true],
    ['abc', true],
    ['ab', false],
    ['a'.repeat(61), false],
    ['Buffet', false],
    ['-buffet', false],
    ['buffet-', false],
    ['buf--fet', false],
    ['buffet_demo', false],
  ])('%s → %s', (slug, esperado) => {
    expect(slugValido(slug)).toBe(esperado);
  });
});

import { describe, expect, it } from 'vitest';
import { dimensoesRedimensionadas, validarArquivoImagem } from '@/domain/imagem';

describe('imagens', () => {
  it.each([
    ['image/jpeg', 1000, null],
    ['image/png', 5 * 1024 * 1024, null],
    ['image/webp', 10, null],
    ['image/gif', 10, 'Use uma imagem JPG, PNG ou WEBP.'],
    ['application/pdf', 10, 'Use uma imagem JPG, PNG ou WEBP.'],
    ['image/jpeg', 5 * 1024 * 1024 + 1, 'A imagem pode ter no máximo 5 MB.'],
  ])('%s com %i bytes', (tipo, tamanho, esperado) => {
    expect(validarArquivoImagem(tipo, tamanho)).toBe(esperado);
  });

  it.each([
    [4000, 3000, 1600, { largura: 1600, altura: 1200 }],
    [3000, 4000, 1600, { largura: 1200, altura: 1600 }],
    [800, 600, 1600, { largura: 800, altura: 600 }],
    [1024, 1024, 512, { largura: 512, altura: 512 }],
    [10000, 1, 1920, { largura: 1920, altura: 1 }],
  ])('%ix%i com máximo %i', (l, a, max, esperado) => {
    expect(dimensoesRedimensionadas(l, a, max)).toEqual(esperado);
  });
});

import { describe, expect, it } from 'vitest';
import { descricaoDaVitrine, tituloDaVitrine, vitrineIndexavel } from '@/domain/publico';

/* SEO da vitrine (§98): cidade no título, demonstração fora do Google. */

const b = { nome: 'Buffet Alegria', sobre: null, cidade: 'Uberlândia', uf: 'mg' };

describe('vitrine no Google', () => {
  it('título: a frase do buffet; sem ela, a cidade', () => {
    expect(tituloDaVitrine(b, 'Festas inesquecíveis')).toBe(
      'Buffet Alegria · Festas inesquecíveis',
    );
    expect(tituloDaVitrine(b, '  ')).toBe('Buffet Alegria em Uberlândia, MG');
    expect(tituloDaVitrine({ ...b, uf: null }, null)).toBe('Buffet Alegria em Uberlândia');
    expect(tituloDaVitrine({ ...b, cidade: null }, null)).toBe('Buffet Alegria');
  });

  it('descrição: o "sobre" até 160 caracteres; sem ele, o convite com a cidade', () => {
    expect(descricaoDaVitrine(b)).toBe(
      'Monte o orçamento da sua festa no Buffet Alegria, em Uberlândia, MG, em poucos minutos, pelo celular.',
    );
    expect(descricaoDaVitrine({ ...b, cidade: null })).toBe(
      'Monte o orçamento da sua festa no Buffet Alegria em poucos minutos, pelo celular.',
    );
    const longo = descricaoDaVitrine({ ...b, sobre: 'a '.repeat(200) });
    expect(longo.length).toBeLessThanOrEqual(160);
    expect(longo.endsWith('...')).toBe(true);
    expect(descricaoDaVitrine({ ...b, sobre: 'Salão  com\npiscina' })).toBe('Salão com piscina');
  });

  it('demonstração e contas de apresentação ficam fora do Google', () => {
    expect(vitrineIndexavel('buffet-alegria', 'demonstracao')).toBe(true);
    expect(vitrineIndexavel('demonstracao', 'demonstracao')).toBe(false);
    expect(vitrineIndexavel('apresentacao-infantil', null)).toBe(false);
    expect(vitrineIndexavel('buffet-alegria', null)).toBe(true);
  });
});

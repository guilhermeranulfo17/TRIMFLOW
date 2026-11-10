import { describe, expect, it } from 'vitest';
import { jsonLdSoftware, type PlanoVitrine } from '@/domain/marketing';

const plano: PlanoVitrine = {
  codigo: 'essencial',
  nome: 'Essencial',
  precoMensalCentavos: 14700,
  precoAnualCentavos: 147000,
  maxUsuarios: 2,
  maxEspacos: 1,
  whatsappAvisos: false,
  followUp: false,
  numerosCompleto: false,
};

describe('jsonLdSoftware', () => {
  it('uma oferta só, com o preço real em reais, e nada de avaliação', () => {
    const j = jsonLdSoftware({ url: 'https://x.test', descricao: 'd', plano });
    expect(j['@type']).toBe('SoftwareApplication');
    expect(j.offers).toEqual(expect.objectContaining({ price: '147.00', priceCurrency: 'BRL' }));
    const texto = JSON.stringify(j);
    expect(texto).not.toMatch(/aggregateRating|review|ratingValue/i);
  });

  it('sem plano (leitura falhou), sem oferta', () => {
    expect(
      jsonLdSoftware({ url: 'https://x.test', descricao: 'd', plano: null }),
    ).not.toHaveProperty('offers');
  });
});

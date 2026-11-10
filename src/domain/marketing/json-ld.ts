import type { PlanoVitrine } from './precos-vitrine';

/*
 * JSON-LD da landing: SoftwareApplication com a oferta real (o preço único da landing). Nunca
 * leva aggregateRating, review ou nota: o Orkestra não inventa avaliação.
 */

const reais = (centavos: number) => (centavos / 100).toFixed(2);

export function jsonLdSoftware(o: {
  url: string;
  descricao: string;
  /** o plano à venda na landing; null = sem oferta (leitura dos preços falhou) */
  plano: PlanoVitrine | null;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Orkestra',
    url: o.url,
    description: o.descricao,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'pt-BR',
    ...(o.plano && {
      offers: {
        '@type': 'Offer',
        price: reais(o.plano.precoMensalCentavos),
        priceCurrency: 'BRL',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: reais(o.plano.precoMensalCentavos),
          priceCurrency: 'BRL',
          unitCode: 'MON',
        },
      },
    }),
  };
}

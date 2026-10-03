import type { PlanoVitrine } from './precos-vitrine';

/*
 * JSON-LD da landing (Etapa 9.6): SoftwareApplication com as ofertas reais dos planos. Nunca
 * leva aggregateRating, review ou nota: o Orkestra não inventa avaliação.
 */

const reais = (centavos: number) => (centavos / 100).toFixed(2);

export function jsonLdSoftware(o: {
  url: string;
  descricao: string;
  planos: PlanoVitrine[];
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
    ...(o.planos.length > 0 && {
      offers: o.planos.map((p) => ({
        '@type': 'Offer',
        name: `Plano ${p.nome}`,
        price: reais(p.precoMensalCentavos),
        priceCurrency: 'BRL',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: reais(p.precoMensalCentavos),
          priceCurrency: 'BRL',
          unitCode: 'MON',
        },
      })),
    }),
  };
}

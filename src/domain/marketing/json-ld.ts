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

/** Organização dona do site (nome, endereço e logo), para o painel de conhecimento do Google. */
export function jsonLdOrganizacao(o: {
  url: string;
  email?: string | null;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Orkestra',
    url: o.url,
    logo: `${o.url}/icones/icone-512.png`,
    ...(o.email && { email: o.email }),
  };
}

/** O site em si (nome que o Google mostra no resultado). */
export function jsonLdSite(url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Orkestra',
    url,
    inLanguage: 'pt-BR',
  };
}

/** Trilha "Início › página", para as páginas internas da landing. */
export function jsonLdTrilha(
  url: string,
  itens: { nome: string; caminho: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: itens.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.nome,
      item: `${url}${it.caminho === '/' ? '' : it.caminho}`,
    })),
  };
}

/** JSON para <script type="application/ld+json"> sem quebrar o HTML (escapa o "<"). */
export function serializarJsonLdLanding(dados: Record<string, unknown>): string {
  return JSON.stringify(dados).replace(/</g, '\\u003c');
}

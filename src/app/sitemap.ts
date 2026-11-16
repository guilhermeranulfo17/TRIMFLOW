import type { MetadataRoute } from 'next';
import { PAGINAS_SEGMENTO } from '@/domain/marketing/segmentos';
import { siteUrl } from '@/server/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    // páginas por tipo de buffet (§98)
    ...PAGINAS_SEGMENTO.map((p) => ({
      url: `${base}${p.caminho}`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    { url: `${base}/termos`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacidade`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/subprocessadores`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}

import type { MetadataRoute } from 'next';
import { urlDoSite } from '@/server/env';

/** Indexáveis: landing, termos, privacidade e a vitrine dos buffets. O resto fica de fora. */
export default function robots(): MetadataRoute.Robots {
  const base = urlDoSite() ?? 'http://localhost:3000';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/termos', '/privacidade', '/b/'],
        disallow: [
          '/app',
          '/interno',
          '/api',
          '/auth',
          '/cadastro/completar',
          '/nova-senha',
          '/b/*/proposta',
          '/b/*/orcamento',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}

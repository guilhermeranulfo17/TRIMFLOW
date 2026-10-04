import type { MetadataRoute } from 'next';
import { siteUrl } from '@/server/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/termos`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacidade`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/subprocessadores`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}

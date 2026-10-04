import type { MetadataRoute } from 'next';
import { urlDoSite } from '@/server/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = urlDoSite() ?? 'http://localhost:3000';
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/termos`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacidade`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/subprocessadores`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}

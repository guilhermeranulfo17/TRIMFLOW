import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // As imagens já chegam redimensionadas e em WEBP (conversão no navegador, Etapa 2).
    unoptimized: true,
  },
};

export default nextConfig;

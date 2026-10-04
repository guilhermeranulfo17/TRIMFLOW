import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // radix-ui (pacote único) não é podado sozinho; lucide-react e date-fns já estão na lista
    // padrão do Next.
    optimizePackageImports: ['radix-ui'],
  },
  // PDF gerado no servidor: a biblioteca roda como pacote Node (não entra no bundle).
  serverExternalPackages: ['@react-pdf/renderer', 'sharp'],
  // As fontes do PDF são lidas do disco: precisam ir junto nas funções das rotas de PDF.
  outputFileTracingIncludes: {
    '/b/[slug]/proposta/[token]/pdf': ['./src/server/proposta/fontes/**'],
    '/app/orcamentos/[id]/pdf': ['./src/server/proposta/fontes/**'],
    '/app/empresa/proposta-exemplo/pdf': ['./src/server/proposta/fontes/**'],
  },
  images: {
    // As imagens já chegam redimensionadas e em WEBP (conversão no navegador, Etapa 2).
    unoptimized: true,
  },
  async headers() {
    // Página pública do buffet: não pode ser embutida em outro site nem vazar o caminho
    // (com o token da proposta) para terceiros.
    const seguranca = [
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ];
    return [
      { source: '/b/:path*', headers: seguranca },
      // Landing (Etapa 9.6): os mesmos cabeçalhos e nunca dentro de iframe
      {
        source: '/',
        headers: [
          ...seguranca,
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
      // A vitrine pode abrir num iframe do próprio painel (prévia do editor); o resto, nunca.
      {
        source: '/b/:slug',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: '/b/:slug/:resto+',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
      { source: '/b/:slug/proposta/:token', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
      { source: '/b/:slug/orcamento', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
};

export default nextConfig;

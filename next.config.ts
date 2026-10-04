import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs/config';
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
  // Navegador: zod sem JIT (sem `Function("")`, que a CSP recusa). Ver src/lib/zod-sem-jit.ts.
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        zod$: path.join(process.cwd(), 'src/lib/zod-sem-jit.ts'),
      };
    }
    return config;
  },
  images: {
    // As imagens já chegam redimensionadas e em WEBP (conversão no navegador, Etapa 2).
    unoptimized: true,
  },
  async headers() {
    // Cabeçalhos de segurança e CSP saem do middleware em todas as rotas (Etapa 9B, B.2,
    // domain/seguranca/cabecalhos). Aqui só os arquivos estáticos, que não passam por ele, e o
    // noindex das páginas privadas do link público.
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
      { source: '/b/:slug/proposta/:token', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
      { source: '/b/:slug/orcamento', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
};

// Source maps no Sentry só com SENTRY_AUTH_TOKEN (build da Vercel); sem ele, build normal.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      telemetry: false,
      widenClientFileUpload: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : nextConfig;

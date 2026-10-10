import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

/*
 * PDF (proposta, contrato e QR): a Manrope é lida do disco e o pdfkit (dentro do
 * @react-pdf/renderer) carrega a fonte padrão por require dinâmico. Nenhum dos dois é visto pelo
 * rastreio de arquivos do Next: sem estes includes o PDF dá erro 500 na Vercel (no CI e em
 * `next start` funciona, porque lá o node_modules inteiro está no disco). Rota nova que gera PDF
 * entra aqui (o teste pdf-rastreio confere).
 */
const ARQUIVOS_PDF = [
  './src/server/proposta/fontes/**',
  './node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/**',
];
const ROTAS_PDF = [
  '/b/[slug]/proposta/[token]/pdf',
  '/app/orcamentos/[id]/pdf',
  '/app/empresa/proposta-exemplo/pdf',
  '/app/empresa/link/qr',
  // Etapa 10: PDF do contrato (rota do cliente, do painel e a página que assina e já gera)
  '/b/[slug]/contrato/[token]',
  '/b/[slug]/contrato/[token]/pdf',
  '/app/contratos/[id]/pdf',
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // radix-ui (pacote único) não é podado sozinho; lucide-react e date-fns já estão na lista
    // padrão do Next.
    optimizePackageImports: ['radix-ui'],
  },
  // PDF gerado no servidor: a biblioteca roda como pacote Node (não entra no bundle).
  serverExternalPackages: ['@react-pdf/renderer', 'sharp'],
  // Arquivos que o rastreio do Next não vê e precisam ir junto nas funções que geram PDF.
  outputFileTracingIncludes: Object.fromEntries(ROTAS_PDF.map((r) => [r, ARQUIVOS_PDF])),
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

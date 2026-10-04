/*
 * Cabeçalhos de segurança (Etapa 9B, B.2), montados pelo middleware em todas as rotas.
 *
 * CSP com nonce nas páginas dinâmicas: só roda script com o nonce da requisição (o Next põe o
 * nonce nos dele) e o que eles carregarem ('strict-dynamic'). Páginas estáticas (a landing, com
 * ISR, e os textos legais) são servidas do cache, sem nonce: lá o script inline do Next é
 * liberado por 'unsafe-inline' (nenhuma tem conteúdo de usuário). Rotas que devolvem JSON,
 * PDF ou arquivo ganham uma CSP que não carrega nada.
 */

export type TipoRota = 'pagina' | 'pagina_estatica' | 'arquivo';

/** Páginas pré-renderizadas no build (ver a saída do `next build`: ○ e ●). */
export const PAGINAS_ESTATICAS = ['/', '/termos', '/privacidade', '/subprocessadores'] as const;

/** Respostas que não são HTML: JSON das APIs, PDFs, ZIP, imagens geradas, QR. */
export function tipoDaRota(pathname: string): TipoRota {
  if ((PAGINAS_ESTATICAS as readonly string[]).includes(pathname)) return 'pagina_estatica';
  if (
    pathname.startsWith('/api/') ||
    /\/(pdf|exportar|opengraph-image|qr|qr\.png|qr\.pdf)(\/|$)/.test(pathname) ||
    /\.(png|pdf|zip|txt|xml|json|webmanifest)$/.test(pathname) ||
    pathname.startsWith('/auth/')
  ) {
    return 'arquivo';
  }
  return 'pagina';
}

/** Só a vitrine (/b/slug) abre num iframe, e só do próprio site (prévia do editor). */
export function podeSerEmbutida(pathname: string): boolean {
  return /^\/b\/[^/]+\/?$/.test(pathname);
}

export type OpcoesCsp = {
  tipo: TipoRota;
  nonce?: string | null;
  /** origem do Supabase (API, Auth e Storage), ex.: https://xyz.supabase.co */
  supabase?: string | null;
  /** origem do Sentry para enviar erros do navegador (do DSN público) */
  sentry?: string | null;
  embutivel?: boolean;
  desenvolvimento?: boolean;
  /** só em HTTPS: pede ao navegador para trocar http:// por https:// nos recursos */
  https?: boolean;
};

function origem(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Origem de ingestão do Sentry a partir do DSN (https://chave@o123.ingest.sentry.io/456). */
export function origemDoSentry(dsn: string | null | undefined): string | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function montarCsp(o: OpcoesCsp): string {
  const quadros = o.embutivel ? "'self'" : "'none'";
  if (o.tipo === 'arquivo') {
    return [`default-src 'none'`, `frame-ancestors ${quadros}`, `base-uri 'none'`].join('; ');
  }
  const supabase = origem(o.supabase);
  const supabaseWs = supabase?.replace(/^http/, 'ws') ?? null;
  const sentry = origem(o.sentry);
  const script =
    o.tipo === 'pagina' && o.nonce
      ? [`'self'`, `'nonce-${o.nonce}'`, `'strict-dynamic'`]
      : [`'self'`, `'unsafe-inline'`];
  if (o.desenvolvimento) script.push(`'unsafe-eval'`);

  const diretivas: [string, (string | null)[]][] = [
    ['default-src', [`'self'`]],
    ['script-src', script],
    ['style-src', [`'self'`, `'unsafe-inline'`]],
    ['img-src', [`'self'`, 'data:', 'blob:', supabase]],
    ['font-src', [`'self'`, 'data:']],
    ['connect-src', [`'self'`, supabase, supabaseWs, sentry]],
    ['media-src', [`'self'`, supabase]],
    ['frame-src', [`'self'`]],
    ['worker-src', [`'self'`, 'blob:']],
    ['manifest-src', [`'self'`]],
    ['form-action', [`'self'`]],
    ['base-uri', [`'self'`]],
    ['object-src', [`'none'`]],
    ['frame-ancestors', [quadros]],
  ];
  const partes = diretivas.map(([nome, valores]) =>
    [nome, ...valores.filter((v): v is string => !!v)].join(' '),
  );
  if (o.https) partes.push('upgrade-insecure-requests');
  return partes.join('; ');
}

/** Os outros cabeçalhos (iguais em todas as rotas). */
export function cabecalhosFixos(o: { embutivel: boolean; https: boolean }): Record<string, string> {
  return {
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': o.embutivel ? 'SAMEORIGIN' : 'DENY',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), browsing-topics=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    ...(o.https ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
  };
}

/** Nonce de 128 bits em base64 (sem dependência de Node: roda no middleware do Edge). */
export function gerarNonce(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

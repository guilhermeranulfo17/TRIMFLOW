import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { precisaSegundoFator } from '@/domain/auth/mfa';
import {
  cabecalhosFixos,
  gerarNonce,
  montarCsp,
  origemDoSentry,
  podeSerEmbutida,
  tipoDaRota,
} from '@/domain/seguranca/cabecalhos';
import {
  DESTINO_PADRAO,
  ehRotaProtegida,
  ehRotaSoVisitante,
  precisaTrocarSenha,
} from '@/server/auth/redirecionamento';

/**
 * Duas coisas, nesta ordem:
 * 1. Cabeçalhos de segurança em todas as rotas (Etapa 9B, B.2): CSP com nonce nas páginas
 *    dinâmicas, HSTS, Referrer-Policy, Permissions-Policy, nosniff e X-Frame-Options, e o id da
 *    requisição (x-request-id) para o log estruturado.
 * 2. Sessão do Supabase (só fora das rotas públicas): renova a sessão e aplica as regras de acesso
 *    - /app/** exige sessão (senão vai para /login?next=…)
 *    - usuário logado em /login ou /cadastro vai para /app/leads
 *    - usuário com senha temporária (app_metadata.trocar_senha) vai para /nova-senha
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const tipo = tipoDaRota(pathname);
  const embutivel = podeSerEmbutida(pathname);
  const nonce = tipo === 'pagina' ? gerarNonce() : null;
  const csp = montarCsp({
    tipo,
    nonce,
    embutivel,
    supabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
    sentry: origemDoSentry(process.env.NEXT_PUBLIC_SENTRY_DSN),
    desenvolvimento: process.env.NODE_ENV === 'development',
    https: request.nextUrl.protocol === 'https:',
  });
  const idRequisicao = request.headers.get('x-vercel-id') ?? crypto.randomUUID();

  // O Next lê o nonce do cabeçalho CSP da requisição e o põe nos scripts que gera.
  const cabecalhos = new Headers(request.headers);
  cabecalhos.set('x-request-id', idRequisicao);
  if (nonce) {
    cabecalhos.set('x-nonce', nonce);
    cabecalhos.set('content-security-policy', csp);
  }

  const proteger = (r: NextResponse) => {
    r.headers.set('Content-Security-Policy', csp);
    for (const [k, v] of Object.entries(
      cabecalhosFixos({ embutivel, https: request.nextUrl.protocol === 'https:' }),
    )) {
      r.headers.set(k, v);
    }
    r.headers.set('x-request-id', idRequisicao);
    return r;
  };

  let response = NextResponse.next({ request: { headers: cabecalhos } });
  if (!usaSessao(pathname)) return proteger(response);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesParaGravar, headers) {
          for (const { name, value } of cookiesParaGravar) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: cabecalhos } });
          for (const { name, value, options } of cookiesParaGravar) {
            response.cookies.set(name, value, options);
          }
          for (const [chave, valor] of Object.entries(headers)) response.headers.set(chave, valor);
        },
      },
    },
  );

  // getClaims() renova o token se precisar e valida o JWT pela chave pública do projeto (sem
  // ida ao servidor do Auth). Com a chave antiga (HS256), o próprio supabase-js cai no getUser().
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  const user = claims
    ? { id: claims.sub, app_metadata: (claims.app_metadata ?? {}) as Record<string, unknown> }
    : null;

  if (!user && ehRotaProtegida(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return proteger(redirecionar(url, response));
  }

  // Vendedor criado pelo dono entra com senha temporária: precisa criar a própria senha antes.
  if (user && precisaTrocarSenha(user.app_metadata) && ehRotaProtegida(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/nova-senha';
    url.search = '';
    return proteger(redirecionar(url, response));
  }

  // Verificação em duas etapas ligada (Etapa 9B): sessão só com a senha (aal1) não entra no
  // painel. Marca e nível vêm dos claims do JWT (sem ida ao Auth).
  if (user && ehRotaProtegida(pathname) && precisaSegundoFator(claims)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login/verificacao';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return proteger(redirecionar(url, response));
  }

  if (user && ehRotaSoVisitante(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = DESTINO_PADRAO;
    url.search = '';
    return proteger(redirecionar(url, response));
  }

  return proteger(response);
}

/**
 * Rotas que não tocam no Auth (como antes da Etapa 9B, quando ficavam fora do matcher): a landing
 * (estática), a página pública do buffet, contagem da landing, webhooks e rotas chamadas pelo
 * pg_cron, saúde e os textos legais.
 */
export function usaSessao(pathname: string): boolean {
  return !(
    pathname === '/' ||
    pathname === '/opengraph-image' ||
    pathname.startsWith('/b/') ||
    pathname.startsWith('/api/landing/') ||
    pathname === '/api/cobranca/asaas' ||
    pathname === '/api/cobranca/reconciliar' ||
    pathname === '/api/avisos/processar' ||
    pathname === '/api/lgpd/processar' ||
    pathname === '/api/saude' ||
    pathname === '/termos' ||
    pathname === '/privacidade' ||
    pathname === '/subprocessadores' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  );
}

/** Redireciona preservando cookies de sessão renovados. */
function redirecionar(url: URL, base: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of base.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  // Tudo, menos arquivos estáticos (o Next e a Vercel já servem com os cabeçalhos do next.config).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icones/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$).*)',
  ],
};

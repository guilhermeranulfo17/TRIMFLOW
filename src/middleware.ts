import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  DESTINO_PADRAO,
  ehRotaProtegida,
  ehRotaSoVisitante,
  precisaTrocarSenha,
} from '@/server/auth/redirecionamento';

/**
 * Renova a sessão do Supabase a cada requisição e aplica as regras de acesso:
 * - /app/** exige sessão (senão vai para /login?next=…)
 * - usuário logado em /login ou /cadastro vai para /app/leads
 * - usuário com senha temporária (app_metadata.trocar_senha) vai para /nova-senha
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
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

  const { pathname, search } = request.nextUrl;

  if (!user && ehRotaProtegida(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return redirecionar(url, response);
  }

  // Vendedor criado pelo dono entra com senha temporária: precisa criar a própria senha antes.
  if (user && precisaTrocarSenha(user.app_metadata) && ehRotaProtegida(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/nova-senha';
    url.search = '';
    return redirecionar(url, response);
  }

  if (user && ehRotaSoVisitante(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = DESTINO_PADRAO;
    url.search = '';
    return redirecionar(url, response);
  }

  return response;
}

/** Redireciona preservando cookies de sessão renovados. */
function redirecionar(url: URL, base: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of base.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  // Fora do middleware (nada de Auth): a landing (`/` e a imagem dela, Etapa 9.6), página pública
  // do buffet, contagem da landing, webhooks/filas chamados por servidor, PWA e estáticos.
  matcher: [
    '/((?!$|opengraph-image|api/landing/|_next/static|_next/image|favicon.ico|b/|api/cobranca/asaas|api/cobranca/reconciliar|api/avisos/processar|manifest.webmanifest|sw.js|icones/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};

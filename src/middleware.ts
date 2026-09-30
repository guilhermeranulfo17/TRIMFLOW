import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { DESTINO_PADRAO, ehRotaProtegida, ehRotaSoVisitante } from '@/server/auth/redirecionamento';

/**
 * Renova a sessão do Supabase a cada requisição e aplica as regras de acesso:
 * - /app/** exige sessão (senão vai para /login?next=…)
 * - usuário logado em /login ou /cadastro vai para /app/leads
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

  // getUser() valida o token no servidor do Auth (não confia só no cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && ehRotaProtegida(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

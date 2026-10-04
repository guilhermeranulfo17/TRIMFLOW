import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_DEMO, ehSessaoDemo } from '@/domain/auth/demo';
import { criarClienteSupabase } from '@/server/auth/supabase-server';

/**
 * Encerra a sessão e volta ao login. Usado quando há sessão no Auth mas o usuário
 * não tem acesso ao painel (inativo ou sem cadastro), para não prender o usuário num loop.
 * Da demonstração (Etapa 9B): `para=cadastro` (botão "Criar conta grátis") e
 * `motivo=demo-fim` (2 horas) levam ao cadastro. Sempre por <a>, nunca <Link> (prefetch).
 */
export async function GET(request: NextRequest) {
  const supabase = await criarClienteSupabase();
  // a demo tem um usuário só para todos: sair encerra só esta sessão, nunca as dos outros
  const { data } = await supabase.auth.getClaims();
  const demo = ehSessaoDemo(data?.claims?.app_metadata as Record<string, unknown> | undefined);
  await supabase.auth.signOut({ scope: demo ? 'local' : 'global' });
  const motivo = request.nextUrl.searchParams.get('motivo');
  const cadastro = request.nextUrl.searchParams.get('para') === 'cadastro' || motivo === 'demo-fim';
  const url = new URL(cadastro ? '/cadastro' : '/login', request.url);
  if (motivo === 'sem-acesso') url.searchParams.set('erro', 'sem-acesso');
  if (motivo === 'demo-fim') url.searchParams.set('demo', 'fim');
  const r = NextResponse.redirect(url);
  r.cookies.delete(COOKIE_DEMO);
  return r;
}

import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteSupabase } from '@/server/auth/supabase-server';

/**
 * Encerra a sessão e volta ao login. Usado quando há sessão no Auth mas o usuário
 * não tem acesso ao painel (inativo ou sem cadastro), para não prender o usuário num loop.
 */
export async function GET(request: NextRequest) {
  const supabase = await criarClienteSupabase();
  await supabase.auth.signOut();
  const motivo = request.nextUrl.searchParams.get('motivo');
  const url = new URL('/login', request.url);
  if (motivo === 'sem-acesso') url.searchParams.set('erro', 'sem-acesso');
  return NextResponse.redirect(url);
}

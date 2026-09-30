import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { destinoSeguro } from '@/server/auth/redirecionamento';
import { criarClienteSupabase } from '@/server/auth/supabase-server';

/** Destino dos links de e-mail (recuperação de senha, confirmação). Troca o token/code por sessão. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const tipo = searchParams.get('type') as EmailOtpType | null;
  const destino = destinoSeguro(searchParams.get('next'));

  const supabase = await criarClienteSupabase();

  // Template recomendado (supabase/templates/recovery.html): token_hash funciona em qualquer navegador.
  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(destino, request.url));
  }

  // Template padrão do Supabase (PKCE): troca o code pela sessão no mesmo navegador.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destino, request.url));
  }

  return NextResponse.redirect(new URL('/recuperar-senha?erro=link-invalido', request.url));
}

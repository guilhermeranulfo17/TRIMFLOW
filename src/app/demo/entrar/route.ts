import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_DEMO, DURACAO_DEMO_MS, fimDaDemo } from '@/domain/auth/demo';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { depsDemo } from '@/server/demo/deps';
import { demoPronta } from '@/server/demo/recriar';
import { codigoDoErro, logar } from '@/server/log';
import { dentroDoLimite } from '@/server/seguranca/limite';

/**
 * "Ver o painel de demonstração" (landing, Etapa 9B): entra direto no usuário único da demo,
 * sem senha. POST (formulário), nunca GET: um prefetch não pode abrir sessão. O servidor gera um
 * link mágico pela Admin API (sem e-mail), troca por sessão aqui e marca o fim em 2 horas.
 */
export async function POST(request: NextRequest) {
  const voltar = (q: string) => NextResponse.redirect(new URL(q, request.url), 303);
  const deps = depsDemo();
  if (!deps) return voltar('/');
  if (!(await dentroDoLimite('login'))) return voltar('/cadastro?demo=limite');
  try {
    const demo = await demoPronta(deps);
    const hash = await deps.auth.hashDeEntrada(demo.email);
    const supabase = await criarClienteSupabase();
    await supabase.auth.signOut({ scope: 'local' });
    const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: hash });
    if (error) throw error;
  } catch (erro) {
    logar('erro', 'demo.entrar_falhou', { codigo: codigoDoErro(erro) });
    return voltar('/cadastro?demo=indisponivel');
  }
  const r = NextResponse.redirect(new URL('/app/leads', request.url), 303);
  r.cookies.set(COOKIE_DEMO, fimDaDemo(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACAO_DEMO_MS / 1000,
  });
  return r;
}

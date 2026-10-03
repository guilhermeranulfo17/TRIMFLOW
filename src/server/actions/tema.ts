'use server';

import { cookies } from 'next/headers';
import { COOKIE_TEMA, temaValido } from '@/domain/tema';
import { usuarioAtual } from '@/server/auth/sessao';

/** Grava o tema do painel no cookie (preferência do aparelho, não da conta). */
export async function definirTema(valor: string): Promise<void> {
  if (!(await usuarioAtual())) return;
  (await cookies()).set(COOKIE_TEMA, temaValido(valor), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}

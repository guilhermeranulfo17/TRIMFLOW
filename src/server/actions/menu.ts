'use server';

import { cookies } from 'next/headers';
import { COOKIE_MENU } from '@/domain/tema';
import { usuarioAtual } from '@/server/auth/sessao';

/** Grava se o menu lateral fica recolhido (preferência do aparelho, como o tema). */
export async function definirMenuRecolhido(recolhido: boolean): Promise<void> {
  if (!(await usuarioAtual())) return;
  (await cookies()).set(COOKIE_MENU, recolhido ? 'recolhido' : 'aberto', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}

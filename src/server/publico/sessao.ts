import 'server-only';
import { sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { usuarioAtual } from '@/server/auth/sessao';
import { comUsuario } from '@/server/db/tenant';
import { demoSlug } from '@/server/env';

/** Cookie com o token do orçamento em andamento (retomar o wizard). Um por buffet. */
export function cookieDoOrcamento(slug: string): string {
  return `orc_${slug}`;
}

export const OPCOES_COOKIE = (slug: string) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: `/b/${slug}`,
  maxAge: 30 * 24 * 60 * 60,
});

export async function lerTokenDoCookie(slug: string): Promise<string | null> {
  const valor = (await cookies()).get(cookieDoOrcamento(slug))?.value;
  return valor && /^[A-Za-z0-9_-]{32,}$/.test(valor) ? valor : null;
}

/**
 * Modo teste: quem abre o link é um usuário logado da PRÓPRIA empresa ("Testar como cliente").
 * Decidido só pela sessão no servidor, nunca por parâmetro do navegador. Nada conta nas métricas
 * e a pré-reserva é simulada.
 */
export async function ehModoTeste(slug: string): Promise<boolean> {
  // a vitrine da demonstração é sempre modo teste: nada vira lead real (Etapa 9B)
  if (slug === demoSlug()) return true;
  try {
    const usuario = await usuarioAtual();
    return usuario?.empresa.slug === slug;
  } catch {
    // Sessão quebrada ou senha temporária: o visitante segue como cliente comum.
    return false;
  }
}

/**
 * Checklist "testar o link como cliente": registra a primeira vez que alguém da empresa abre o
 * link em modo teste. Nunca atrapalha a página.
 */
export async function marcarLinkTestado(): Promise<void> {
  try {
    const usuario = await usuarioAtual();
    if (!usuario) return;
    await comUsuario(usuario.id, (tx) => tx.execute(sql`select public.marcar_link_testado()`));
  } catch {
    // métrica do checklist: falhar aqui não muda nada para quem testa
  }
}

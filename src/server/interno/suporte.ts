import 'server-only';
import type { User } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { chaveDerivada } from '@/server/auth/admin-supabase';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { obterDb } from '@/server/db/client';
import { ehAdminOrkestra } from './guard';
import {
  assinarSuporte,
  COOKIE_SUPORTE,
  fimDaSessaoSuporte,
  lerSuporte,
  type SessaoSuporte,
} from './suporte-cookie';

/*
 * Modo suporte: a equipe entra na conta de um buffet que deu consentimento. Validação a cada
 * request: cookie assinado + mesma sessão de admin (lista + MFA) + consentimento vigente.
 */

const chave = () => chaveDerivada('suporte');

/** Consentimento vigente da empresa (fim) ou null. */
export async function consentimentoAte(empresaId: string): Promise<Date | null> {
  const [l] = await obterDb().execute<{ ate: string | null }>(
    sql`select public.suporte_vigente(${empresaId}) as ate`,
  );
  return l?.ate ? new Date(l.ate) : null;
}

/** Sessão de suporte válida para este usuário do Auth, ou null (nunca lança). */
export async function sessaoSuporteValida(user: User): Promise<SessaoSuporte | null> {
  try {
    const valor = (await cookies()).get(COOKIE_SUPORTE)?.value;
    if (!valor) return null;
    const s = lerSuporte(valor, await chave());
    if (!s || s.adminId !== user.id || !ehAdminOrkestra(user.email)) return null;
    if (s.adminEmail !== user.email?.toLowerCase()) return null;
    const supabase = await criarClienteSupabase();
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel !== 'aal2') return null;
    const ate = await consentimentoAte(s.empresaId);
    if (!ate) return null;
    return s;
  } catch {
    return null;
  }
}

/** Grava o cookie da sessão de suporte (até 2 h, nunca além do consentimento). */
export async function abrirSessaoSuporte(
  dados: Omit<SessaoSuporte, 'exp'>,
  consentimento: Date,
): Promise<number> {
  const exp = fimDaSessaoSuporte(Date.now(), consentimento.getTime());
  (await cookies()).set(COOKIE_SUPORTE, assinarSuporte({ ...dados, exp }, await chave()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(exp),
  });
  return exp;
}

export async function fecharSessaoSuporte(): Promise<SessaoSuporte | null> {
  const c = await cookies();
  const atual = lerSuporte(c.get(COOKIE_SUPORTE)?.value, await chave());
  c.delete(COOKIE_SUPORTE);
  return atual;
}

import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { adminsOrkestra } from '@/server/env';

/*
 * Acesso ao /interno: sessão do Supabase + e-mail em ORKESTRA_ADMINS + MFA (aal2).
 * Fora da lista: 404 (o /interno nem "existe"). Sem MFA: vai cadastrar ou confirmar o TOTP.
 */

export type AdminAtual = {
  id: string;
  email: string;
  /** a sessão já passou pelo TOTP */
  aal2: boolean;
  /** tem fator TOTP verificado (pede o código) */
  temFator: boolean;
};

export const ehAdminOrkestra = (email: string | null | undefined): boolean =>
  !!email && adminsOrkestra().includes(email.toLowerCase());

/** Admin logado (com ou sem MFA), ou null. Memo por requisição. */
export const adminAtual = cache(async (): Promise<AdminAtual | null> => {
  const supabase = await criarClienteSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !ehAdminOrkestra(user.email)) return null;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    id: user.id,
    email: user.email!.toLowerCase(),
    aal2: data?.currentLevel === 'aal2',
    temFator: data?.nextLevel === 'aal2',
  };
});

export async function exigirAdmin(): Promise<AdminAtual> {
  const supabase = await criarClienteSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/interno/entrar');
  const admin = await adminAtual();
  if (!admin) notFound();
  if (!admin.aal2) redirect('/interno/mfa');
  return admin;
}

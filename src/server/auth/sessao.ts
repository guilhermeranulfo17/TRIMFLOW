import 'server-only';
import { sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { Situacao } from '@/domain/cobranca/situacao';
import type { Perfil } from '@/server/db/schema';
import { lerComo } from '@/server/db/tenant';
import { sessaoSuporteValida, temCookieSuporte } from '@/server/interno/suporte';
import { contextoSuporte } from './contexto-suporte';
import { precisaTrocarSenha } from './redirecionamento';
import { criarClienteSupabase } from './supabase-server';

export type UsuarioAtual = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  empresa: {
    id: string;
    nome: string;
    slug: string;
    fuso: string;
    /** situação da conta (Etapa 9A): suspenso = painel somente leitura */
    situacao: Situacao;
  };
  /** modo suporte (equipe Orkestra com consentimento do dono): mostra a faixa vermelha */
  suporte: { admin: string } | null;
};

/**
 * Usuário logado + empresa, ou null. Memoizado por requisição.
 * A leitura passa pelo RLS (comUsuario): se o usuário estiver inativo, não há linha.
 */
export const usuarioAtual = cache(async (): Promise<UsuarioAtual | null> => {
  const supabase = await criarClienteSupabase();
  // Identidade pelos claims do JWT (validado localmente pela chave pública; sem rede). Com o
  // cookie de suporte presente, revalida forte no servidor do Auth (getUser).
  const comSuporte = await temCookieSuporte();
  let user: { id: string; email?: string | null; app_metadata: Record<string, unknown> } | null;
  if (comSuporte) {
    user = (await supabase.auth.getUser()).data.user;
  } else {
    const claims = (await supabase.auth.getClaims()).data?.claims;
    user = claims
      ? {
          id: claims.sub,
          email: (claims.email as string | undefined) ?? null,
          app_metadata: (claims.app_metadata ?? {}) as Record<string, unknown>,
        }
      : null;
  }
  if (!user) return null;
  // Redirect de server action não passa pelo middleware: a troca obrigatória vale aqui também.
  if (precisaTrocarSenha(user.app_metadata)) redirect('/nova-senha');

  // Modo suporte: a sessão do admin age como o dono da empresa que consentiu (RLS igual).
  const suporte = comSuporte ? await sessaoSuporteValida(user) : null;
  const alvo = suporte?.donoId ?? user.id;
  if (suporte) contextoSuporte().admin = suporte.adminEmail;

  const lido = await lerUsuario(alvo);
  if (!lido) return null;
  return { ...lido, suporte: suporte ? { admin: suporte.adminEmail } : null };
});

/** Usuário ativo + empresa pelo id (lido pelo RLS como o próprio usuário), ou null. Uma ida. */
export async function lerUsuario(alvo: string): Promise<Omit<UsuarioAtual, 'suporte'> | null> {
  const [linhas] = await lerComo(alvo, [
    sql`select u.id, u.nome, u.email, u.perfil, u.ativo, e.id as empresa_id,
               e.nome as empresa_nome, e.slug as empresa_slug, e.fuso as empresa_fuso,
               e.plano as empresa_situacao
        from public.usuarios u join public.empresas e on e.id = u.empresa_id
        where u.id = ${alvo} limit 1`,
  ]);
  const linha = linhas?.[0] as Record<string, string | boolean> | undefined;
  if (!linha?.ativo) return null;

  return {
    id: String(linha.id),
    nome: String(linha.nome),
    email: String(linha.email),
    perfil: linha.perfil as Perfil,
    empresa: {
      id: String(linha.empresa_id),
      nome: String(linha.empresa_nome),
      slug: String(linha.empresa_slug),
      fuso: String(linha.empresa_fuso),
      situacao: linha.empresa_situacao as Situacao,
    },
  };
}

/**
 * Exige usuário ativo. Sem sessão → /login. Com sessão no Auth mas sem acesso ao painel
 * (inativo ou sem cadastro) → encerra a sessão e mostra o motivo no login.
 */
export async function exigirSessao(): Promise<UsuarioAtual> {
  const usuario = await usuarioAtual();
  if (usuario) return usuario;
  redirect('/auth/sair?motivo=sem-acesso');
}

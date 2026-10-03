import 'server-only';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { Situacao } from '@/domain/cobranca/situacao';
import { empresas, usuarios, type Perfil } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { sessaoSuporteValida } from '@/server/interno/suporte';
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // Redirect de server action não passa pelo middleware: a troca obrigatória vale aqui também.
  if (precisaTrocarSenha(user.app_metadata)) redirect('/nova-senha');

  // Modo suporte: a sessão do admin age como o dono da empresa que consentiu (RLS igual).
  const suporte = await sessaoSuporteValida(user);
  const alvo = suporte?.donoId ?? user.id;
  if (suporte) contextoSuporte().admin = suporte.adminEmail;

  const [linha] = await comUsuario(alvo, (tx) =>
    tx
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        perfil: usuarios.perfil,
        ativo: usuarios.ativo,
        empresaId: empresas.id,
        empresaNome: empresas.nome,
        empresaSlug: empresas.slug,
        empresaFuso: empresas.fuso,
        empresaSituacao: empresas.plano,
      })
      .from(usuarios)
      .innerJoin(empresas, eq(empresas.id, usuarios.empresaId))
      .where(eq(usuarios.id, alvo))
      .limit(1),
  );
  if (!linha?.ativo) return null;

  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    perfil: linha.perfil,
    empresa: {
      id: linha.empresaId,
      nome: linha.empresaNome,
      slug: linha.empresaSlug,
      fuso: linha.empresaFuso,
      situacao: linha.empresaSituacao,
    },
    suporte: suporte ? { admin: suporte.adminEmail } : null,
  };
});

/**
 * Exige usuário ativo. Sem sessão → /login. Com sessão no Auth mas sem acesso ao painel
 * (inativo ou sem cadastro) → encerra a sessão e mostra o motivo no login.
 */
export async function exigirSessao(): Promise<UsuarioAtual> {
  const usuario = await usuarioAtual();
  if (usuario) return usuario;
  redirect('/auth/sair?motivo=sem-acesso');
}

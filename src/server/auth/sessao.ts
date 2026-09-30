import 'server-only';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { empresas, usuarios, type Perfil } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { criarClienteSupabase } from './supabase-server';

export type UsuarioAtual = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  empresa: { id: string; nome: string; slug: string };
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

  const [linha] = await comUsuario(user.id, (tx) =>
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
      })
      .from(usuarios)
      .innerJoin(empresas, eq(empresas.id, usuarios.empresaId))
      .where(eq(usuarios.id, user.id))
      .limit(1),
  );
  if (!linha?.ativo) return null;

  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    perfil: linha.perfil,
    empresa: { id: linha.empresaId, nome: linha.empresaNome, slug: linha.empresaSlug },
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

import 'server-only';
import { eq } from 'drizzle-orm';
import { obterDb } from './client';
import { empresas } from './schema';

/*
 * ACESSO ADMINISTRATIVO — ignora RLS.
 * Só entra aqui o que precisa ler/escrever sem um usuário logado e foi revisado para expor
 * o mínimo. Cada função deve dizer por que precisa de acesso administrativo.
 */

export type EmpresaPublica = { nome: string; slug: string };

/**
 * Página pública /b/[slug]: visitante anônimo precisa do nome do buffet.
 * Seleciona SOMENTE nome e slug; nenhum outro dado da empresa sai daqui.
 */
export async function buscarEmpresaPublicaPorSlug(slug: string): Promise<EmpresaPublica | null> {
  const [empresa] = await obterDb()
    .select({ nome: empresas.nome, slug: empresas.slug })
    .from(empresas)
    .where(eq(empresas.slug, slug))
    .limit(1);
  return empresa ?? null;
}

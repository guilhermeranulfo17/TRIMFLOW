import 'server-only';
import { eq, sql } from 'drizzle-orm';
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

/**
 * Redirecionamento de slug antigo em /b/[slug]: o visitante anônimo chega por um link antigo.
 * Devolve só o slug atual, e só enquanto o antigo ainda vale (12 meses após a troca).
 */
export async function buscarSlugAtualPorAntigo(slug: string): Promise<string | null> {
  const [linha] = await obterDb().execute<{ atual: string | null }>(
    sql`select public.slug_atual_por_antigo(${slug}) as atual`,
  );
  return linha?.atual ?? null;
}

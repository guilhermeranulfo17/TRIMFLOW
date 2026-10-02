import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

export type EmpresaTemporaria = { empresaId: string; donoId: string; vendedorId: string };

/**
 * Cria (e confirma) uma empresa isolada com dono e vendedor, para testes que precisam de
 * transações reais (código que abre a própria transação). Remova com `removerEmpresa`.
 */
export async function criarEmpresaTemporaria(
  sql: postgres.Sql,
  segmento: 'infantil' | 'eventos' | 'domicilio',
): Promise<EmpresaTemporaria> {
  const sufixo = randomUUID().slice(0, 8);
  const [empresa] = await sql`insert into public.empresas (nome, slug, segmento)
    values (${`Buffet Temp ${sufixo}`}, ${`buffet-temp-${sufixo}`}, ${segmento}) returning id`;
  const donoId = randomUUID();
  const vendedorId = randomUUID();
  for (const [id, perfil] of [
    [donoId, 'dono'],
    [vendedorId, 'vendedor'],
  ] as const) {
    const email = `${perfil}-${sufixo}@temp.test`;
    await sql`insert into auth.users (id, email, raw_user_meta_data, aud, role)
      values (${id}, ${email}, ${sql.json({ nome: perfil })}, 'authenticated', 'authenticated')`;
    await sql`insert into public.usuarios (id, empresa_id, nome, email, perfil)
      values (${id}, ${empresa!.id}, ${`Pessoa ${perfil}`}, ${email}, ${perfil})`;
  }
  return { empresaId: empresa!.id as string, donoId, vendedorId };
}

export async function removerEmpresa(sql: postgres.Sql, e: EmpresaTemporaria): Promise<void> {
  await sql`delete from public.usuarios where empresa_id = ${e.empresaId}`;
  await sql`delete from public.empresas where id = ${e.empresaId}`;
  await sql`delete from auth.users where id in ${sql([e.donoId, e.vendedorId])}`;
}

/**
 * Confirma os preços do catálogo (o que o dono faz no passo 3 do onboarding). O modelo grava
 * com preço de exemplo, que fica fora do link público até a confirmação (Etapa 8).
 */
export async function confirmarPrecosDoModelo(sql: postgres.Sql, empresaId: string) {
  await sql`update public.pacotes set preco_confirmado_em = now() where empresa_id = ${empresaId}`;
  await sql`update public.opcionais set preco_confirmado_em = now() where empresa_id = ${empresaId}`;
}

import 'server-only';
import { sql } from 'drizzle-orm';
import { VERSAO_DOCUMENTOS } from '@/domain/legal/versao';
import { modeloDoSegmento } from '@/domain/modelos';
import { gravarModelo } from '@/server/catalogo/gravar-modelo';
import type { Db } from '@/server/db/client';
import { preambuloUsuario } from '@/server/db/tenant';

/*
 * Conta de demonstração (Etapa 9B, B.5). Uma empresa (eh_demo) com o modelo infantil e 60 dias de
 * dados fictícios, recriada todo dia pela rota /api/demo/recriar (pg_cron) e, se faltar ou estiver
 * com os Termos antigos, na entrada (/demo/entrar). O visitante entra sem senha num usuário único
 * do Auth; o banco recusa qualquer escrita dele (DEMO_SOMENTE_LEITURA).
 */

/** E-mail do usuário único da demo (domínio reservado: nunca recebe nada). */
export const EMAIL_DEMO = 'demonstracao@orkestra.invalid';

/** O mínimo que a demo precisa da Admin API do Auth (os testes injetam uma versão falsa). */
export interface AuthDemo {
  /** Cria (ou reaproveita e limpa) o usuário da demo e devolve o id. */
  garantirUsuario(email: string): Promise<string>;
  /** Hash de um link mágico (não envia e-mail): o servidor troca por sessão com verifyOtp. */
  hashDeEntrada(email: string): Promise<string>;
}

export type DepsDemo = { db: Db; auth: AuthDemo; slug: string };

export type DemoAtual = { usuarioId: string; email: string; termosVersao: string | null };

/** Demo existente com o slug configurado, ou null. */
export async function lerDemo(db: Db, slug: string): Promise<DemoAtual | null> {
  const [l] = (await db.execute(
    sql`select u.id, u.email, u.termos_versao from public.usuarios u
        join public.empresas e on e.id = u.empresa_id
        where e.eh_demo and e.slug = ${slug} and u.ativo limit 1`,
  )) as unknown as { id: string; email: string; termos_versao: string | null }[];
  return l ? { usuarioId: l.id, email: l.email, termosVersao: l.termos_versao } : null;
}

/**
 * Apaga e cria a demo numa transação só: empresa e usuário (demo_recriar), catálogo do modelo
 * infantil com o RLS do dono da demo (gravarModelo) e os dados (demo_popular).
 */
export async function recriarDemo(d: DepsDemo): Promise<{ empresaId: string; leads: number }> {
  const usuarioId = await d.auth.garantirUsuario(EMAIL_DEMO);
  return d.db.transaction(async (tx) => {
    const [r] = (await tx.execute(
      sql`select public.demo_recriar(${d.slug}, ${usuarioId}::uuid, ${EMAIL_DEMO}, ${VERSAO_DOCUMENTOS}) as id`,
    )) as unknown as { id: string }[];
    const empresaId = r!.id;

    // o catálogo entra como o dono da demo (RLS e triggers do cadastro), ainda na montagem
    await tx.execute(sql.raw(preambuloUsuario(usuarioId, null)));
    const gravado = await gravarModelo(
      async (_id, fn) => fn(tx),
      usuarioId,
      empresaId,
      modeloDoSegmento('infantil'),
    );
    if (!gravado.ok) throw new Error('DEMO_CATALOGO');
    await tx.execute(sql`reset role`);
    await tx.execute(sql`select set_config('request.jwt.claims', '', true)`);

    const [p] = (await tx.execute(
      sql`select public.demo_popular(${empresaId}::uuid) as n`,
    )) as unknown as { n: number }[];
    return { empresaId, leads: Number(p?.n ?? 0) };
  });
}

/** Garante a demo pronta (existe e com os Termos vigentes) e devolve o usuário para entrar. */
export async function demoPronta(d: DepsDemo): Promise<DemoAtual> {
  const atual = await lerDemo(d.db, d.slug);
  if (atual && atual.termosVersao === VERSAO_DOCUMENTOS) return atual;
  await recriarDemo(d);
  const nova = await lerDemo(d.db, d.slug);
  if (!nova) throw new Error('DEMO_INDISPONIVEL');
  return nova;
}

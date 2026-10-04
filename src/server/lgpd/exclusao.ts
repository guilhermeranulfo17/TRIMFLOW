import 'server-only';
import { sql } from 'drizzle-orm';
import type { AuthAdmin, StorageAdmin } from '@/server/auth/admin-supabase';
import type { Db } from '@/server/db/client';

/*
 * Exclusão definitiva das contas com o prazo de 30 dias vencido (Etapa 9B, B.1). Roda pela rota
 * /api/lgpd/processar (pg_cron, CRON_SECRET), na conexão administrativa. Ordem: arquivos do
 * Storage → usuários do Auth → banco (public.lgpd_excluir_empresa, que confere o prazo de novo).
 * Idempotente: se parar no meio, a próxima execução continua de onde ficou.
 */

export type DepsExclusao = {
  db: Db;
  storage: StorageAdmin;
  auth: Pick<AuthAdmin, 'apagarUsuario'>;
  agora?: () => Date;
};

export type ResumoExclusao = { excluidas: string[]; falhas: string[] };

const BUCKET = 'midia';

export async function processarExclusoes(d: DepsExclusao): Promise<ResumoExclusao> {
  const agora = d.agora?.() ?? new Date();
  const contas = (await d.db.execute(
    sql`select empresa_id, usuarios from public.lgpd_contas_a_excluir(${agora.toISOString()}::timestamptz)`,
  )) as unknown as { empresa_id: string; usuarios: string[] }[];

  const resumo: ResumoExclusao = { excluidas: [], falhas: [] };
  for (const c of contas) {
    try {
      const arquivos = await d.storage.listar(BUCKET, c.empresa_id);
      if (arquivos.length) await d.storage.remover(BUCKET, arquivos);
      for (const id of c.usuarios) {
        try {
          await d.auth.apagarUsuario(id);
        } catch (erro) {
          // já apagado no Auth: segue
          if (!/not.?found|404/i.test(String((erro as Error).message))) throw erro;
        }
      }
      await d.db.execute(
        sql`select public.lgpd_excluir_empresa(${c.empresa_id}::uuid, ${agora.toISOString()}::timestamptz)`,
      );
      resumo.excluidas.push(c.empresa_id);
    } catch {
      resumo.falhas.push(c.empresa_id);
    }
  }
  return resumo;
}

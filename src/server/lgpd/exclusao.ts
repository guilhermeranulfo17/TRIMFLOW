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
  storage: Pick<StorageAdmin, 'listar' | 'remover'>;
  auth: Pick<AuthAdmin, 'apagarUsuario'>;
  agora?: () => Date;
};

export type ResumoExclusao = { excluidas: string[]; falhas: string[] };

// mídia pública do buffet e PDFs dos contratos (Etapa 10)
const BUCKETS = ['midia', 'contratos'] as const;

export async function processarExclusoes(d: DepsExclusao): Promise<ResumoExclusao> {
  const agora = d.agora?.() ?? new Date();
  const contas = (await d.db.execute(
    sql`select empresa_id, usuarios from public.lgpd_contas_a_excluir(${agora.toISOString()}::timestamptz)`,
  )) as unknown as { empresa_id: string; usuarios: string[] }[];

  const resumo: ResumoExclusao = { excluidas: [], falhas: [] };
  for (const c of contas) {
    try {
      for (const bucket of BUCKETS) {
        const arquivos = await d.storage.listar(bucket, c.empresa_id);
        if (arquivos.length) await d.storage.remover(bucket, arquivos);
      }
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

/**
 * PDFs de contratos anonimizados (5 anos depois da festa, ou lead apagado a pedido com
 * contrato não assinado): apaga o arquivo do Storage e limpa a marca no banco. Idempotente.
 */
export async function removerPdfsAnonimizados(
  d: Pick<DepsExclusao, 'db' | 'storage'>,
): Promise<number> {
  const linhas = (await d.db.execute(
    sql`select empresa_id, contrato_id from public.contratos_pdfs_a_remover()`,
  )) as unknown as { empresa_id: string; contrato_id: string }[];
  let n = 0;
  for (const l of linhas) {
    await d.storage.remover('contratos', [`${l.empresa_id}/${l.contrato_id}.pdf`]);
    await d.db.execute(sql`select public.contrato_pdf_removido(${l.contrato_id}::uuid)`);
    n++;
  }
  return n;
}

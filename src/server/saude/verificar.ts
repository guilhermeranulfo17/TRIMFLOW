import 'server-only';
import { sql } from 'drizzle-orm';
import { avaliarSaude, type JobCron, type Saude } from '@/domain/observabilidade/saude';
import { configAsaas } from '@/server/cobranca/config';
import { obterDb } from '@/server/db/client';
import { lerPrecosVitrine } from '@/server/marketing/carregar';

/*
 * GET /api/saude (Etapa 9B, B.3). Dependências injetadas para o teste simular fila atrasada e
 * falha na leitura dos preços. A leitura do banco usa a conexão administrativa (saude_sistema só
 * para o servidor) e devolve só números e nomes de jobs.
 */

export type DepsSaude = {
  lerBanco: () => Promise<{ fila_atraso_min: number; jobs: JobCron[] | null }>;
  lerPlanos: () => Promise<{ planos: unknown[] }>;
  asaasConfigurado: () => boolean;
  agora?: () => Date;
};

export const depsSaude = (): DepsSaude => ({
  lerBanco: async () => {
    const [linha] = await obterDb().execute<{
      j: { fila_atraso_min: number; jobs: JobCron[] | null };
    }>(sql`select public.saude_sistema() as j`);
    return linha!.j;
  },
  lerPlanos: () => lerPrecosVitrine(),
  asaasConfigurado: () => configAsaas() !== null,
});

async function tentar<T>(fn: () => Promise<T>, ms = 5000): Promise<T | null> {
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, rejeitar) => setTimeout(() => rejeitar(new Error('tempo')), ms)),
    ]);
  } catch {
    return null;
  }
}

export async function verificarSaude(d: DepsSaude): Promise<Saude> {
  const [banco, planos] = await Promise.all([tentar(d.lerBanco), tentar(d.lerPlanos)]);
  return avaliarSaude(
    {
      banco: banco !== null,
      filaAtrasoMin: banco?.fila_atraso_min ?? null,
      jobs: banco?.jobs ?? null,
      asaasConfigurado: d.asaasConfigurado(),
      planosVitrine: !!planos && planos.planos.length > 0,
    },
    d.agora?.() ?? new Date(),
  );
}

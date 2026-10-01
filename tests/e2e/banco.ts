import { readFileSync } from 'node:fs';
import postgres from 'postgres';

/*
 * Acesso direto ao banco local nos E2E, só para preparar cenários que não têm tela
 * (suspender um plano) e zerar os limites do link público (todos os visitantes do teste têm o
 * mesmo IP). Nunca aponte para produção.
 */
function urlDoBanco(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync('.env.local', 'utf8');
  const linha = env.split('\n').find((l) => l.startsWith('DATABASE_URL='));
  if (!linha) throw new Error('DATABASE_URL não encontrada para o E2E.');
  return linha.slice('DATABASE_URL='.length).trim();
}

export async function noBanco<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(urlDoBanco(), { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

export const zerarLimites = () => noBanco((sql) => sql`delete from publico.tentativas`);

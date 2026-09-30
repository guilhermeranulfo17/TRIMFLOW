import 'server-only';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

/** Cria um cliente Drizzle. `prepare: false` é exigido pelo pooler do Supabase (modo transação). */
export function criarDb(url: string, opcoes: { max?: number } = {}): { db: Db; sql: postgres.Sql } {
  const conexao = postgres(url, { prepare: false, max: opcoes.max ?? 5, onnotice: () => {} });
  return { db: drizzle(conexao, { schema }), sql: conexao };
}

const globalParaDb = globalThis as unknown as { orkestraDb?: Db };

/**
 * Cliente de banco do servidor. Conecta como `postgres` (ignora RLS por padrão), por isso
 * NUNCA use direto em código de feature: use `comUsuario` (./tenant) ou, para acesso
 * administrativo explícito, `dbAdmin` (./admin).
 */
export function obterDb(): Db {
  if (!globalParaDb.orkestraDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL não configurada.');
    globalParaDb.orkestraDb = criarDb(url).db;
  }
  return globalParaDb.orkestraDb;
}

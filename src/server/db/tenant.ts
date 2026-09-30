import 'server-only';
import { sql } from 'drizzle-orm';
import { obterDb, type Db } from './client';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Executa `fn` numa transação com a identidade do usuário: `role authenticated` + claims do JWT.
 * Assim as policies de RLS valem também no servidor — é o padrão para toda query da área logada.
 */
export function criarComUsuario(db: Db) {
  return async function comUsuario<T>(usuarioId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      const claims = JSON.stringify({ sub: usuarioId, role: 'authenticated' });
      await tx.execute(
        sql`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`,
      );
      return fn(tx);
    });
  };
}

export function comUsuario<T>(usuarioId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return criarComUsuario(obterDb())(usuarioId, fn);
}

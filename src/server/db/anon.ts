import 'server-only';
import { sql } from 'drizzle-orm';
import { obterDb, type Db } from './client';
import type { Tx } from './tenant';

/**
 * Executa `fn` numa transação com `role anon` (visitante do link público). anon não lê nenhuma
 * tabela: só executa as funções do schema `publico`, que validam tudo e expõem o mínimo.
 * É o único caminho do link público ao banco (o `admin.ts` não é usado pela página pública).
 */
export function criarComAnon(db: Db) {
  return async function comAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('role', 'anon', true)`,
      );
      return fn(tx);
    });
  };
}

export function comAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return criarComAnon(obterDb())(fn);
}

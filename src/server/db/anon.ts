import 'server-only';
import { obterDb, sqlDoDb, type Db } from './client';
import { emTransacaoReservada, PREAMBULO_ANON, type Tx } from './tenant';

/**
 * Executa `fn` numa transação com `role anon` (visitante do link público). anon não lê nenhuma
 * tabela: só executa as funções do schema `publico`, que validam tudo e expõem o mínimo.
 * É o único caminho do link público ao banco (o `admin.ts` não é usado pela página pública).
 */
export function criarComAnon(db: Db) {
  const base = sqlDoDb(db);
  return async function comAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return emTransacaoReservada(base, PREAMBULO_ANON, fn);
  };
}

export function comAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return criarComAnon(obterDb())(fn);
}

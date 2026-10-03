import 'server-only';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { PostgresJsSession, PostgresJsTransaction } from 'drizzle-orm/postgres-js/session';
import { PgDialect } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { inlineParametros } from './inline';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

type SqlLike = postgres.Sql | postgres.TransactionSql | postgres.ReservedSql;

/**
 * Envolve o cliente `postgres` para o Drizzle mandar os parâmetros inline pelo protocolo
 * simples (uma ida por consulta e pipeline de consultas simultâneas; ver ./inline). O resto da
 * API (begin, reserve, end…) passa direto; transações abertas pelo Drizzle também são envolvidas.
 */
export function envolver<T extends SqlLike>(cliente: T): T {
  return new Proxy(cliente, {
    get(alvo, prop, receptor) {
      if (prop === 'unsafe') {
        return (texto: string, parametros: unknown[] = [], opcoes?: postgres.UnsafeQueryOptions) =>
          parametros.length
            ? alvo.unsafe(inlineParametros(texto, parametros), [], opcoes)
            : alvo.unsafe(texto, [], opcoes);
      }
      if (prop === 'begin' && 'begin' in alvo) {
        return (a: unknown, b?: unknown) => {
          const fn = (typeof a === 'function' ? a : b) as (tx: postgres.TransactionSql) => unknown;
          const opcoes = typeof a === 'string' ? a : '';
          return (alvo as postgres.Sql).begin(opcoes, (tx) => fn(envolver(tx)));
        };
      }
      const v = Reflect.get(alvo, prop, receptor);
      return typeof v === 'function' ? v.bind(alvo) : v;
    },
  });
}

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const dialeto = new PgDialect();

/**
 * Transação do Drizzle sobre uma conexão reservada em que o `BEGIN` já foi mandado (ver
 * ./tenant). Sem o schema relacional: não usamos db.query dentro de transações.
 */
export function transacaoSobre(reservado: postgres.ReservedSql): Tx {
  const sessao = new PostgresJsSession(
    envolver(reservado) as unknown as postgres.Sql,
    dialeto,
    undefined,
  );
  return new PostgresJsTransaction(dialeto, sessao as never, undefined) as unknown as Tx;
}

/** Cria um cliente Drizzle. `prepare: false` é exigido pelo pooler do Supabase (modo transação). */
const sqlPorDb = new WeakMap<Db, postgres.Sql>();

export function criarDb(url: string, opcoes: { max?: number } = {}): { db: Db; sql: postgres.Sql } {
  const conexao = postgres(url, {
    prepare: false,
    max: opcoes.max ?? 5,
    onnotice: () => {},
  });
  const db = drizzle(envolver(conexao), { schema });
  sqlPorDb.set(db, conexao);
  return { db, sql: conexao };
}

/** O cliente `postgres` de um Db criado por criarDb (transação reservada, leitura de uma ida). */
export function sqlDoDb(db: Db): postgres.Sql {
  const s = sqlPorDb.get(db);
  if (!s) throw new Error('Db sem cliente postgres associado (use criarDb).');
  return s;
}

const globalParaDb = globalThis as unknown as { orkestraDb?: Db; orkestraSql?: postgres.Sql };

function iniciar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurada.');
  const { db, sql } = criarDb(url);
  globalParaDb.orkestraDb = db;
  globalParaDb.orkestraSql = sql;
}

/**
 * Cliente de banco do servidor. Conecta como `postgres` (ignora RLS por padrão), por isso
 * NUNCA use direto em código de feature: use `comUsuario` (./tenant) ou, para acesso
 * administrativo explícito, `dbAdmin` (./admin).
 */
export function obterDb(): Db {
  if (!globalParaDb.orkestraDb) iniciar();
  return globalParaDb.orkestraDb!;
}

/** O cliente `postgres` por baixo de obterDb (para transações e leituras de uma ida). */
export function obterSql(): postgres.Sql {
  if (!globalParaDb.orkestraSql) iniciar();
  return globalParaDb.orkestraSql!;
}

import 'server-only';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type postgres from 'postgres';
import { contextoSuporte } from '@/server/auth/contexto-suporte';
import { obterDb, sqlDoDb, transacaoSobre, type Db, type Tx } from './client';
import { inlineParametros, literal } from './inline';

export type { Tx };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identidade da transação: `role authenticated` + claims do usuário, e (Etapa 9A) quem da
 * equipe está no modo suporte. Tudo com `set_config(..., true)`: vale só até o fim da
 * transação, e a conexão volta ao pool sem identidade nenhuma.
 */
export function preambuloUsuario(usuarioId: string, admin: string | null | undefined): string {
  if (!UUID.test(usuarioId)) throw new Error('Identificador de usuário inválido.');
  const claims = JSON.stringify({ sub: usuarioId.toLowerCase(), role: 'authenticated' });
  return (
    `select set_config('request.jwt.claims', ${literal(claims)}, true), ` +
    `set_config('role', 'authenticated', true), ` +
    `set_config('orkestra.suporte_admin', ${literal(admin ?? '')}, true)`
  );
}

export const PREAMBULO_ANON =
  `select set_config('request.jwt.claims', '{"role":"anon"}', true), ` +
  `set_config('role', 'anon', true)`;

/**
 * Transação numa conexão reservada. `BEGIN` + identidade seguem sem esperar resposta e as
 * consultas disparadas por `fn` (Promise.all) vão logo atrás, na mesma ida e em pipeline
 * (parâmetros inline, ver ./inline). A ordem na conexão é garantida: nenhuma consulta roda antes
 * da identidade, e se o preâmbulo falhar a transação fica abortada e nada depois dele executa.
 * Erro = rollback; a conexão sempre volta ao pool.
 */
export async function emTransacaoReservada<T>(
  base: postgres.Sql,
  preambulo: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const reservado = await base.reserve();
  try {
    const inicio = reservado.unsafe(`begin; ${preambulo}`);
    inicio.catch(() => undefined); // tratado abaixo (não vira rejeição solta)
    try {
      const r = await fn(transacaoSobre(reservado));
      await inicio;
      await reservado.unsafe('commit');
      return r;
    } catch (erro) {
      await reservado.unsafe('rollback').catch(() => undefined);
      // se o preâmbulo falhou, é ele a causa
      throw await inicio.then(
        () => erro,
        (e: unknown) => e,
      );
    }
  } finally {
    reservado.release();
  }
}

/**
 * Executa `fn` numa transação com a identidade do usuário: `role authenticated` + claims do JWT.
 * Assim as policies de RLS valem também no servidor — é o padrão para toda query da área logada.
 */
export function criarComUsuario(db: Db, o: { suporteAdmin?: () => string | null } = {}) {
  const base = sqlDoDb(db);
  return async function comUsuario<T>(usuarioId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return emTransacaoReservada(base, preambuloUsuario(usuarioId, o.suporteAdmin?.()), fn);
  };
}

export function comUsuario<T>(usuarioId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return criarComUsuario(obterDb(), { suporteAdmin: () => contextoSuporte().admin })(usuarioId, fn);
}

/**
 * Usa a transação da tela, se houver (várias leituras numa transação só, em pipeline), ou abre
 * uma própria. Os loaders recebem `tx` opcional e passam por aqui.
 */
export function naTransacao<T>(
  usuarioId: string,
  tx: Tx | undefined,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return tx ? fn(tx) : comUsuario(usuarioId, fn);
}

const dialeto = new PgDialect();

/** SQL do Drizzle → texto com os parâmetros inline (uma instrução). */
export function textoDaConsulta(consulta: SQL): string {
  const q = dialeto.sqlToQuery(consulta);
  return inlineParametros(q.sql, q.params);
}

type Linhas = Record<string, unknown>[];

/**
 * Leituras de UMA ida ao banco: identidade + várias consultas numa mensagem só (protocolo
 * simples = uma transação implícita; erro desfaz tudo e a identidade some ao fim). Devolve as
 * linhas de cada consulta, na ordem. Só para leitura.
 */
export function criarLerComo(db: Db, o: { suporteAdmin?: () => string | null } = {}) {
  const base = sqlDoDb(db);
  return async function lerComo(usuarioId: string, consultas: SQL[]): Promise<Linhas[]> {
    const texto = [
      preambuloUsuario(usuarioId, o.suporteAdmin?.()),
      ...consultas.map(textoDaConsulta),
    ].join(';\n');
    const resultado = (await base.unsafe(texto)) as unknown as Linhas[];
    return resultado.slice(1).map((r) => [...r]);
  };
}

export function lerComo(usuarioId: string, consultas: SQL[]): Promise<Linhas[]> {
  return criarLerComo(obterDb(), { suporteAdmin: () => contextoSuporte().admin })(
    usuarioId,
    consultas,
  );
}

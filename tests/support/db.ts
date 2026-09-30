import postgres from 'postgres';

/** Banco dos testes de integração: Supabase local por padrão. */
export function urlBancoTeste(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  );
}

export const IDS = {
  empresaA: '11111111-1111-4111-8111-111111111111',
  empresaB: '22222222-2222-4222-8222-222222222222',
  donoA: '1a000000-0000-4000-8000-000000000001',
  vendedorA: '1a000000-0000-4000-8000-000000000002',
  donoB: '2b000000-0000-4000-8000-000000000001',
} as const;

export function conectar(): postgres.Sql {
  return postgres(urlBancoTeste(), { max: 2, prepare: false, onnotice: () => {} });
}

class Rollback extends Error {}

/** Roda `fn` numa transação que SEMPRE é desfeita no final. */
export async function emTransacao<T>(
  sql: postgres.Sql,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  let resultado: T | undefined;
  try {
    await sql.begin(async (tx) => {
      resultado = await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return resultado as T;
}

/** Assume a identidade de um usuário autenticado (como o PostgREST/Supabase faz). */
export async function assumirUsuario(tx: postgres.TransactionSql, usuarioId: string) {
  const claims = JSON.stringify({ sub: usuarioId, role: 'authenticated' });
  await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`;
}

export async function assumirAnon(tx: postgres.TransactionSql) {
  await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('role', 'anon', true)`;
}

/** Transação desfeita no final, já com a identidade do usuário. */
export function comoUsuario<T>(
  sql: postgres.Sql,
  usuarioId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return emTransacao(sql, async (tx) => {
    await assumirUsuario(tx, usuarioId);
    return fn(tx);
  });
}

/** Espera que a promessa falhe com o código SQLSTATE informado (42501 = sem permissão/RLS). */
export async function esperarErroSql(promessa: Promise<unknown>, codigo: string): Promise<void> {
  try {
    await promessa;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === codigo) return;
    throw new Error(`Esperava erro SQL ${codigo}, recebi ${code ?? 'sem código'}: ${String(e)}`);
  }
  throw new Error(`Esperava erro SQL ${codigo}, mas a operação passou.`);
}

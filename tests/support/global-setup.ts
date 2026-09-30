import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { urlBancoTeste } from './db';

const raiz = join(import.meta.dirname, '..', '..');

/**
 * Com TEST_DB_SHIM=1 recria do zero um banco Postgres puro (sem Supabase/Docker):
 * shim do schema auth → migrations → seed. Só roda em bancos cujo nome termina em "_test".
 * Sem a variável, espera um Supabase local já preparado com `pnpm db:reset`.
 */
export default async function setup() {
  const url = urlBancoTeste();
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    if (process.env.TEST_DB_SHIM === '1') {
      const nomeBanco = new URL(url).pathname.slice(1);
      if (!nomeBanco.endsWith('_test')) {
        throw new Error(`TEST_DB_SHIM=1 só roda em banco "*_test" (recebi "${nomeBanco}").`);
      }
      await sql.unsafe(`
        drop schema if exists public cascade;
        drop schema if exists auth cascade;
        drop schema if exists extensions cascade;
        create schema public;
      `);
      const migrations = readdirSync(join(raiz, 'supabase', 'migrations'))
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => join('supabase', 'migrations', f));
      for (const arquivo of ['tests/support/auth-shim.sql', ...migrations, 'supabase/seed.sql']) {
        await sql.unsafe(readFileSync(join(raiz, arquivo), 'utf8'));
      }
      return;
    }

    const [linha] = await sql<{ ok: boolean }[]>`
      select to_regclass('public.empresas') is not null
         and exists (select 1 from public.empresas where slug = 'buffet-demo') as ok`;
    if (!linha?.ok) {
      throw new Error('Banco de teste sem migrations/seed. Rode `pnpm db:reset` antes.');
    }
  } finally {
    await sql.end();
  }
}

import { afterAll, describe, expect, it } from 'vitest';
import { conectar } from '../support/db';

/*
 * Etapa 9.5 (A.6): as FKs compostas das tabelas quentes têm índice com as colunas da FK no
 * começo e na mesma ordem (a regra do advisor "unindexed_foreign_keys" do Supabase).
 */

const sql = conectar();
afterAll(() => sql.end());

const TABELAS = [
  'leads',
  'tarefas',
  'atividades',
  'avisos',
  'avisos_entregas',
  'reservas',
  'orcamentos',
  'notas',
  'visitas',
  'orcamento_itens',
];

describe('índices das chaves estrangeiras', () => {
  it('toda FK composta (…_id, empresa_id) das tabelas quentes tem índice na ordem da FK', async () => {
    const sem = await sql<{ tabela: string; fk: string }[]>`
      select c.conrelid::regclass::text as tabela, c.conname as fk
      from pg_constraint c
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and c.conrelid::regclass::text = any(${TABELAS})
        and array_length(c.conkey, 1) = 2
        and not exists (
          select 1 from pg_index i
          where i.indrelid = c.conrelid and i.indpred is null
            and (i.indkey::int2[])[0:1] = c.conkey)
      order by 1, 2`;
    expect(sem).toEqual([]);
  });
});

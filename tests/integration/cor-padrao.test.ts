import { afterAll, describe, expect, it } from 'vitest';
import { conectar } from '../support/db';

/* Etapa 9.5 (B): migration 20261010000002_cor_padrao. */

const sql = conectar();
afterAll(() => sql.end());

describe('cor padrão do buffet', () => {
  it('o padrão da coluna é o verde-petróleo e nenhuma empresa ficou no roxo antigo', async () => {
    const [col] = await sql<{ padrao: string }[]>`
      select column_default as padrao from information_schema.columns
      where table_schema = 'public' and table_name = 'empresas' and column_name = 'cor_marca'`;
    expect(col!.padrao).toContain('#0F766E');
    const [r] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.empresas where upper(cor_marca) = '#7C5CD6'`;
    expect(r!.n).toBe(0);
  });
});

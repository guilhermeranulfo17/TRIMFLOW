import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { criarDb } from '@/server/db/client';
import { empresas, usuarios } from '@/server/db/schema';
import { criarComUsuario } from '@/server/db/tenant';
import { IDS, urlBancoTeste } from '../support/db';

const { db, sql } = criarDb(urlBancoTeste(), { max: 2 });
const comUsuario = criarComUsuario(db);
afterAll(() => sql.end());

describe('comUsuario (Drizzle com RLS no servidor)', () => {
  it('aplica RLS: dono A só vê a própria empresa', async () => {
    const linhas = await comUsuario(IDS.donoA, (tx) =>
      tx.select({ id: empresas.id }).from(empresas),
    );
    expect(linhas).toEqual([{ id: IDS.empresaA }]);
  });

  it('sem comUsuario (conexão administrativa) enxerga todas', async () => {
    const linhas = await db.select({ id: empresas.id }).from(empresas);
    expect(linhas.length).toBeGreaterThanOrEqual(2);
  });

  it('schema Drizzle bate com o banco (colunas e tipos)', async () => {
    const [u] = await comUsuario(IDS.vendedorA, (tx) =>
      tx.select().from(usuarios).where(eq(usuarios.id, IDS.vendedorA)),
    );
    expect(u).toMatchObject({ perfil: 'vendedor', empresaId: IDS.empresaA, ativo: true });
    expect(u?.limiteDescontoPct).toBe('5.00');
  });
});

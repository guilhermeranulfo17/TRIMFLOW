import { afterAll, describe, expect, it } from 'vitest';
import {
  assumirUsuario,
  comoUsuario,
  conectar,
  emTransacao,
  esperarErroSql,
  IDS,
} from '../support/db';

const sql = conectar();
afterAll(() => sql.end());

describe('perfil vendedor', () => {
  it('lê a própria empresa e os colegas', async () => {
    const empresas = await comoUsuario(
      sql,
      IDS.vendedorA,
      (tx) => tx`select id from public.empresas`,
    );
    const usuarios = await comoUsuario(
      sql,
      IDS.vendedorA,
      (tx) => tx`select id from public.usuarios`,
    );
    expect(empresas).toHaveLength(1);
    expect(usuarios).toHaveLength(2);
  });

  it('não altera a própria empresa', async () => {
    const r = await comoUsuario(
      sql,
      IDS.vendedorA,
      (tx) => tx`update public.empresas set nome = 'Mudou' where id = ${IDS.empresaA}`,
    );
    expect(r.count).toBe(0);
  });

  it('não altera outros usuários', async () => {
    const r = await comoUsuario(
      sql,
      IDS.vendedorA,
      (tx) => tx`update public.usuarios set limite_desconto_pct = 100 where id = ${IDS.donoA}`,
    );
    expect(r.count).toBe(0);
  });

  it('não altera o próprio cadastro (nem aumenta o próprio limite de desconto)', async () => {
    const r = await comoUsuario(
      sql,
      IDS.vendedorA,
      (tx) => tx`update public.usuarios set limite_desconto_pct = 100, perfil = 'dono'
                 where id = ${IDS.vendedorA}`,
    );
    expect(r.count).toBe(0);
  });

  it('vendedor inativo perde o acesso', async () => {
    const linhas = await emTransacao(sql, async (tx) => {
      await tx`update public.usuarios set ativo = false where id = ${IDS.vendedorA}`;
      await assumirUsuario(tx, IDS.vendedorA);
      return tx`select id from public.empresas`;
    });
    expect(linhas).toHaveLength(0);
  });
});

describe('perfil dono', () => {
  it('altera dados permitidos da própria empresa', async () => {
    const r = await comoUsuario(
      sql,
      IDS.donoA,
      (tx) => tx`update public.empresas set nome = 'Buffet Demo Editado', cidade = 'Uberaba'
                 where id = ${IDS.empresaA} returning atualizado_em > criado_em as tocou`,
    );
    expect(r.count).toBe(1);
    expect(r[0]?.tocou).toBe(true);
  });

  it('não altera slug, plano nem trial (privilégio por coluna)', async () => {
    for (const coluna of ['slug', 'plano', 'trial_ate']) {
      const valor = coluna === 'slug' ? 'outro-slug' : coluna === 'plano' ? 'ativo' : null;
      await comoUsuario(sql, IDS.donoA, (tx) =>
        esperarErroSql(
          tx`update public.empresas set ${tx({ [coluna]: valor })} where id = ${IDS.empresaA}`,
          '42501',
        ),
      );
    }
  });

  it('altera vendedor da própria empresa', async () => {
    const r = await comoUsuario(
      sql,
      IDS.donoA,
      (tx) => tx`update public.usuarios set limite_desconto_pct = 10 where id = ${IDS.vendedorA}`,
    );
    expect(r.count).toBe(1);
  });

  it('não move usuário para outra empresa', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(
        tx`update public.usuarios set empresa_id = ${IDS.empresaB} where id = ${IDS.vendedorA}`,
        '42501',
      ),
    );
  });

  it('não deixa a empresa sem dono ativo', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(
        tx`update public.usuarios set perfil = 'vendedor' where id = ${IDS.donoA}`,
        '23514',
      ),
    );
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import {
  assumirAnon,
  comoUsuario,
  conectar,
  emTransacao,
  esperarErroSql,
  IDS,
} from '../support/db';

const sql = conectar();
afterAll(() => sql.end());

describe('isolamento entre empresas (RLS)', () => {
  it('dono da empresa A só enxerga a própria empresa', async () => {
    const linhas = await comoUsuario(sql, IDS.donoA, (tx) => tx`select id from public.empresas`);
    expect(linhas.map((l) => l.id)).toEqual([IDS.empresaA]);
  });

  it('dono da empresa A não lê a empresa B nem filtrando pelo id', async () => {
    const linhas = await comoUsuario(
      sql,
      IDS.donoA,
      (tx) => tx`select id from public.empresas where id = ${IDS.empresaB}`,
    );
    expect(linhas).toHaveLength(0);
  });

  it('usuarios: A só vê usuários da própria empresa', async () => {
    const linhas = await comoUsuario(
      sql,
      IDS.donoA,
      (tx) => tx`select id, empresa_id from public.usuarios`,
    );
    expect(linhas.length).toBe(2);
    expect(linhas.every((l) => l.empresa_id === IDS.empresaA)).toBe(true);
  });

  it('auditoria: A só vê registros da própria empresa', async () => {
    const linhas = await comoUsuario(
      sql,
      IDS.donoA,
      (tx) => tx`select empresa_id from public.auditoria`,
    );
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((l) => l.empresa_id === IDS.empresaA)).toBe(true);
  });

  it('B também fica isolado de A', async () => {
    const empresas = await comoUsuario(sql, IDS.donoB, (tx) => tx`select id from public.empresas`);
    const usuarios = await comoUsuario(sql, IDS.donoB, (tx) => tx`select id from public.usuarios`);
    expect(empresas.map((l) => l.id)).toEqual([IDS.empresaB]);
    expect(usuarios.map((l) => l.id)).toEqual([IDS.donoB]);
  });

  it('A não altera a empresa B', async () => {
    const r = await comoUsuario(
      sql,
      IDS.donoA,
      (tx) => tx`update public.empresas set nome = 'Invadido' where id = ${IDS.empresaB}`,
    );
    expect(r.count).toBe(0);
    const [b] = await sql`select nome from public.empresas where id = ${IDS.empresaB}`;
    expect(b?.nome).toBe('Buffet Teste B');
  });

  it('A não altera usuários da empresa B', async () => {
    const r = await comoUsuario(
      sql,
      IDS.donoA,
      (tx) => tx`update public.usuarios set nome = 'Invadido' where id = ${IDS.donoB}`,
    );
    expect(r.count).toBe(0);
  });

  it('A não grava auditoria em nome da empresa B', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(
        tx`insert into public.auditoria (empresa_id, usuario_id, acao, entidade)
           values (${IDS.empresaB}, ${IDS.donoA}, 'teste', 'empresa')`,
        '42501',
      ),
    );
  });

  it('A não grava auditoria se passando por outro usuário', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(
        tx`insert into public.auditoria (empresa_id, usuario_id, acao, entidade)
           values (${IDS.empresaA}, ${IDS.vendedorA}, 'teste', 'empresa')`,
        '42501',
      ),
    );
  });

  it('A grava auditoria da própria empresa', async () => {
    const r = await comoUsuario(
      sql,
      IDS.donoA,
      (tx) => tx`insert into public.auditoria (empresa_id, usuario_id, acao, entidade)
                 values (${IDS.empresaA}, ${IDS.donoA}, 'teste', 'empresa')`,
    );
    expect(r.count).toBe(1);
  });

  it('auditoria é somente inserção: sem update nem delete', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(tx`update public.auditoria set acao = 'x'`, '42501'),
    );
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(tx`delete from public.auditoria`, '42501'),
    );
  });

  it('usuário autenticado não cria nem apaga empresas e usuários', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(
        tx`insert into public.empresas (nome, slug, segmento) values ('Nova', 'nova-empresa', 'infantil')`,
        '42501',
      ),
    );
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(tx`delete from public.empresas where id = ${IDS.empresaA}`, '42501'),
    );
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(tx`delete from public.usuarios where id = ${IDS.vendedorA}`, '42501'),
    );
  });

  it('anon não lê nenhuma tabela', async () => {
    for (const tabela of ['empresas', 'usuarios', 'auditoria']) {
      await emTransacao(sql, async (tx) => {
        await assumirAnon(tx);
        await esperarErroSql(tx`select * from ${tx('public.' + tabela)}`, '42501');
      });
    }
  });

  it('funções de tenant respondem pela identidade atual', async () => {
    const [r] = await comoUsuario(
      sql,
      IDS.vendedorA,
      (tx) =>
        tx`select public.empresa_do_usuario() as empresa, public.perfil_do_usuario() as perfil`,
    );
    expect(r).toEqual({ empresa: IDS.empresaA, perfil: 'vendedor' });
  });
});

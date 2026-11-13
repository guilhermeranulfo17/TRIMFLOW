import { afterAll, describe, expect, it } from 'vitest';
import { escolherAjusteDia } from '@/domain/preco/ajuste-dia';
import { carregarContexto } from '@/server/catalogo/carregar';
import { criarDb } from '@/server/db/client';
import { criarComUsuario } from '@/server/db/tenant';
import { conectar, IDS, urlBancoTeste } from '../support/db';

/*
 * Fase 6.4: data especial (feriado com preço próprio). A coluna é opcional (expansão): feriado
 * sem ajuste continua como antes; com ajuste, o motor usa o da data. O banco limita o valor.
 */

const sql = conectar();
const { db, sql: sqlDrizzle } = criarDb(urlBancoTeste(), { max: 2 });
const comUsuario = criarComUsuario(db);
const DATA = '2027-05-08';

afterAll(async () => {
  await sql`delete from public.feriados where empresa_id = ${IDS.empresaA} and data = ${DATA}`;
  await sql.end();
  await sqlDrizzle.end();
});

describe('data especial', () => {
  it('o banco recusa ajuste fora da faixa', async () => {
    await expect(
      sql`insert into public.feriados (empresa_id, data, nome, ajuste_bp)
        values (${IDS.empresaA}, ${DATA}, 'Fora', 50000)`,
    ).rejects.toThrow(/feriados_ajuste_bp_valido/);
  });

  it('feriado antigo (sem ajuste) continua válido e com ajuste nulo', async () => {
    const [f] = await sql`select ajuste_bp from public.feriados
      where empresa_id = ${IDS.empresaA} limit 1`;
    if (f) expect(f.ajuste_bp).toBeNull();
  });

  it('o preço próprio chega ao motor pelo contexto do painel', async () => {
    await sql`insert into public.feriados (empresa_id, data, nome, ajuste_bp)
      values (${IDS.empresaA}, ${DATA}, 'Véspera do Dia das Mães', 1500)`;
    const ctx = (await carregarContexto(IDS.donoA, comUsuario))!;
    const f = ctx.feriados.find((x) => x.data === DATA);
    expect(f).toMatchObject({ nome: 'Véspera do Dia das Mães', ajusteBp: 1500 });
    const r = escolherAjusteDia(ctx, DATA, ctx.turnos[0]?.id ?? null);
    expect(r).toMatchObject({
      descricao: 'Ajuste Véspera do Dia das Mães',
      ajuste: { ajusteBp: 1500, turnoId: null },
    });
  });
});

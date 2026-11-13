import { afterAll, describe, expect, it } from 'vitest';
import { retiraveisDoPacote } from '@/domain/preco';
import { carregarContexto } from '@/server/catalogo/carregar';
import { lerContextoPublico } from '@/server/publico/carregar';
import { criarDb } from '@/server/db/client';
import { criarComAnon } from '@/server/db/anon';
import { criarComUsuario } from '@/server/db/tenant';
import {
  comoUsuario,
  conectar,
  emTransacao,
  esperarErroSql,
  IDS,
  urlBancoTeste,
} from '../support/db';

/*
 * Fase 6.5: item incluso que o cliente pode retirar. Colunas novas no vínculo opcional × pacote
 * (expansão, com default) e o valor "retirado" no tipo da linha do orçamento.
 */

const sql = conectar();
const { db, sql: sqlDrizzle } = criarDb(urlBancoTeste(), { max: 2 });
const comUsuario = criarComUsuario(db);
const comAnon = criarComAnon(db);

afterAll(async () => {
  await sql`update public.opcional_pacotes set removivel = false, desconto_retirada_centavos = null
    where empresa_id = ${IDS.empresaA}`;
  await sql.end();
  await sqlDrizzle.end();
});

async function umIncluso() {
  const [v] = await sql`select opcional_id, pacote_id from public.opcional_pacotes
    where empresa_id = ${IDS.empresaA} and relacao = 'incluso' limit 1`;
  return v as { opcional_id: string; pacote_id: string } | undefined;
}

describe('item incluso retirável', () => {
  it('vínculos antigos nascem não retiráveis e sem desconto', async () => {
    const [r] = await sql`select count(*)::int as n from public.opcional_pacotes
      where removivel or desconto_retirada_centavos is not null`;
    expect(r!.n).toBe(0);
  });

  it('o banco só aceita "pode retirar" em incluso e desconto só com "pode retirar"', async () => {
    const [comp] = await sql`select opcional_id, pacote_id from public.opcional_pacotes
      where empresa_id = ${IDS.empresaA} and relacao = 'compativel' limit 1`;
    if (comp)
      await esperarErroSql(
        emTransacao(
          sql,
          (tx) => tx`update public.opcional_pacotes set removivel = true
          where opcional_id = ${comp.opcional_id} and pacote_id = ${comp.pacote_id}`,
        ),
        '23514',
      );
    const inc = (await umIncluso())!;
    await esperarErroSql(
      emTransacao(
        sql,
        (tx) => tx`update public.opcional_pacotes set desconto_retirada_centavos = 100
        where opcional_id = ${inc.opcional_id} and pacote_id = ${inc.pacote_id}`,
      ),
      '23514',
    );
  });

  it('outra empresa não muda o vínculo (RLS)', async () => {
    const inc = (await umIncluso())!;
    const n = await comoUsuario(sql, IDS.donoB, async (tx) => {
      const r = await tx`update public.opcional_pacotes set removivel = true
        where opcional_id = ${inc.opcional_id} and pacote_id = ${inc.pacote_id} returning 1`;
      return r.length;
    });
    expect(n).toBe(0);
  });

  it('chega ao motor pelo painel e pelo link público; linha "retirado" grava no banco', async () => {
    const inc = (await umIncluso())!;
    await sql`update public.opcional_pacotes set removivel = true, desconto_retirada_centavos = 2500
      where opcional_id = ${inc.opcional_id} and pacote_id = ${inc.pacote_id}`;

    const painel = (await carregarContexto(IDS.donoA, comUsuario))!;
    expect(retiraveisDoPacote(painel, inc.pacote_id)).toContainEqual(
      expect.objectContaining({ id: inc.opcional_id, descontoCentavos: 2500 }),
    );

    const [emp] = await sql`select slug from public.empresas where id = ${IDS.empresaA}`;
    const publico = await lerContextoPublico(emp!.slug as string, comAnon);
    expect(retiraveisDoPacote(publico!.ctx, inc.pacote_id).map((r) => r.id)).toContain(
      inc.opcional_id,
    );

    await emTransacao(sql, async (tx) => {
      const [o] =
        await tx`select id from public.orcamentos where empresa_id = ${IDS.empresaA} limit 1`;
      await tx`insert into public.orcamento_itens (empresa_id, orcamento_id, ordem, tipo, descricao,
          quantidade, valor_unitario_centavos, subtotal_centavos, detalhe)
        values (${IDS.empresaA}, ${o!.id}, 99, 'retirado', 'Retirado: Teste', 1, -2500, -2500,
          'Retirado do pacote, com desconto')`;
    });
  });
});

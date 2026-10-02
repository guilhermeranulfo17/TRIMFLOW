import { afterAll, describe, expect, it } from 'vitest';
import { MODELOS } from '@/domain/modelos';
import { gravarModelo } from '@/server/catalogo/gravar-modelo';
import { criarDb } from '@/server/db/client';
import { criarComUsuario } from '@/server/db/tenant';
import { comoUsuario, conectar, esperarErroSql, urlBancoTeste } from '../support/db';
import {
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';

/*
 * Etapa 8: preço confirmado (trigger + gravação do modelo), funções do onboarding e do
 * checklist. O link público com preço confirmado fica em publico-servidor.test.ts.
 */

const sql = conectar();
const { db, sql: sqlDrizzle } = criarDb(urlBancoTeste(), { max: 4 });
const comUsuario = criarComUsuario(db);
afterAll(async () => {
  await sql.end();
  await sqlDrizzle.end();
});

async function comModelo<T>(fn: (e: EmpresaTemporaria) => Promise<T>): Promise<T> {
  const e = await criarEmpresaTemporaria(sql, 'infantil');
  try {
    expect((await gravarModelo(comUsuario, e.donoId, e.empresaId, MODELOS.infantil)).ok).toBe(true);
    return await fn(e);
  } finally {
    await removerEmpresa(sql, e);
  }
}

const confirmados = async (empresaId: string) =>
  sql<{ tabela: string; confirmados: number; total: number }[]>`
    select 'pacotes' as tabela, count(preco_confirmado_em)::int as confirmados, count(*)::int as total
    from public.pacotes where empresa_id = ${empresaId}
    union all
    select 'opcionais', count(preco_confirmado_em)::int, count(*)::int
    from public.opcionais where empresa_id = ${empresaId}`;

describe('preço confirmado', () => {
  it('o modelo grava com preço de exemplo (nada confirmado)', async () => {
    await comModelo(async (e) => {
      const r = await confirmados(e.empresaId);
      expect(r.find((x) => x.tabela === 'pacotes')).toMatchObject({ confirmados: 0 });
      expect(r.find((x) => x.tabela === 'opcionais')).toMatchObject({ confirmados: 0 });
      expect(r.every((x) => x.total > 0)).toBe(true);
    });
  });

  it('salvar preço em qualquer tela confirma; mudar só o nome não confirma', async () => {
    await comModelo(async (e) => {
      await comoUsuario(sql, e.donoId, async (tx) => {
        const [p] = await tx<
          { id: string }[]
        >`select id from public.pacotes order by ordem limit 1`;
        await tx`update public.pacotes set nome = 'Outro nome' where id = ${p!.id}`;
        const [a] = await tx`select preco_confirmado_em from public.pacotes where id = ${p!.id}`;
        expect(a!.preco_confirmado_em).toBeNull();
        await tx`update public.pacotes set valor_excedente_centavos = 9900 where id = ${p!.id}`;
        const [b] = await tx`select preco_confirmado_em from public.pacotes where id = ${p!.id}`;
        expect(b!.preco_confirmado_em).not.toBeNull();

        // faixa alterada confirma o pacote dono da faixa
        const [p2] = await tx<{ id: string }[]>`
          select id from public.pacotes where preco_confirmado_em is null order by ordem limit 1`;
        await tx`update public.faixas_preco set valor_centavos = valor_centavos + 100
          where pacote_id = ${p2!.id} and ate_convidados = 30`;
        const [c] = await tx`select preco_confirmado_em from public.pacotes where id = ${p2!.id}`;
        expect(c!.preco_confirmado_em).not.toBeNull();

        // opcional: preço gravado confirma
        const [o] = await tx<
          { id: string }[]
        >`select id from public.opcionais order by ordem limit 1`;
        await tx`update public.opcionais set preco_centavos = 1234 where id = ${o!.id}`;
        const [d] = await tx`select preco_confirmado_em from public.opcionais where id = ${o!.id}`;
        expect(d!.preco_confirmado_em).not.toBeNull();
      });
    });
  });

  it('pacote criado pelo dono numa tela já nasce confirmado', async () => {
    await comModelo(async (e) => {
      await comoUsuario(sql, e.donoId, async (tx) => {
        const [p] =
          await tx`insert into public.pacotes (empresa_id, nome, modelo_preco, preco_pessoa_centavos)
          values (${e.empresaId}, 'Novo', 'por_pessoa', 9000) returning preco_confirmado_em`;
        expect(p!.preco_confirmado_em).not.toBeNull();
      });
    });
  });
});

describe('confirmar_precos (passo 3)', () => {
  it('grava faixas, excedente e preço por pessoa, confirma e audita', async () => {
    await comModelo(async (e) => {
      const pacotes = await sql<{ id: string; modelo_preco: string }[]>`
        select id, modelo_preco from public.pacotes where empresa_id = ${e.empresaId} order by ordem`;
      const [opc] = await sql<{ id: string }[]>`
        select id from public.opcionais where empresa_id = ${e.empresaId} order by ordem limit 1`;
      const alvo = pacotes[0]!;
      expect(alvo.modelo_preco).toBe('por_faixa');
      await comoUsuario(sql, e.donoId, async (tx) => {
        const [r] = await tx`select public.confirmar_precos(${tx.json({
          pacotes: [
            {
              id: alvo.id,
              valor_excedente_centavos: 8000,
              faixas: [
                { ate_convidados: 30, valor_centavos: 300000 },
                { ate_convidados: 60, valor_centavos: 450000 },
              ],
            },
          ],
          opcionais: [{ id: opc!.id, preco_centavos: 50000 }],
        })}) as n`;
        expect(r!.n).toBe(2);
        const faixas = await tx`select ate_convidados, valor_centavos from public.faixas_preco
          where pacote_id = ${alvo.id} order by ate_convidados`;
        expect(faixas.map((f) => [f.ate_convidados, f.valor_centavos])).toEqual([
          [30, 300000],
          [60, 450000],
        ]);
        const [p] = await tx`select valor_excedente_centavos, preco_confirmado_em
          from public.pacotes where id = ${alvo.id}`;
        expect(p).toMatchObject({ valor_excedente_centavos: 8000 });
        expect(p!.preco_confirmado_em).not.toBeNull();
        // os outros pacotes continuam como exemplo
        const [outros] = await tx`select count(*)::int as n from public.pacotes
          where id <> ${alvo.id} and preco_confirmado_em is null`;
        expect(outros!.n).toBe(pacotes.length - 1);
        const [a] = await tx`select dados from public.auditoria
          where acao = 'catalogo.precos_confirmados' order by criado_em desc limit 1`;
        expect((a!.dados as { antes: unknown[] }).antes).toHaveLength(1);
      });
    });
  });

  it('recusa faixas fora de ordem, preço zero e pacote de outra empresa', async () => {
    await comModelo(async (e) => {
      const [p] = await sql<{ id: string }[]>`
        select id from public.pacotes where empresa_id = ${e.empresaId} order by ordem limit 1`;
      const [outro] = await sql<{ id: string }[]>`
        select id from public.pacotes where empresa_id <> ${e.empresaId} limit 1`;
      const chamar = (precos: unknown) =>
        comoUsuario(
          sql,
          e.donoId,
          (tx) => tx`select public.confirmar_precos(${tx.json(precos as never)})`,
        );
      await esperarErroSql(
        chamar({
          pacotes: [
            {
              id: p!.id,
              valor_excedente_centavos: 100,
              faixas: [
                { ate_convidados: 50, valor_centavos: 1000 },
                { ate_convidados: 30, valor_centavos: 900 },
              ],
            },
          ],
        }),
        '23514',
      );
      await esperarErroSql(
        chamar({
          pacotes: [
            {
              id: p!.id,
              valor_excedente_centavos: 100,
              faixas: [{ ate_convidados: 30, valor_centavos: 0 }],
            },
          ],
        }),
        '23514',
      );
      await esperarErroSql(chamar({ pacotes: [{ id: outro!.id, faixas: [] }] }), 'P0002');
    });
  });

  it('vendedor não confirma preços nem mexe no onboarding', async () => {
    await comModelo(async (e) => {
      await esperarErroSql(
        comoUsuario(sql, e.vendedorId, (tx) => tx`select public.confirmar_precos('{}'::jsonb)`),
        '42501',
      );
      await esperarErroSql(
        comoUsuario(sql, e.vendedorId, (tx) => tx`select public.avancar_onboarding(2::smallint)`),
        '42501',
      );
    });
  });
});

describe('avancar_onboarding e checklist', () => {
  it('salva o passo, exige preço confirmado depois do passo 3 e conclui no 5', async () => {
    await comModelo(async (e) => {
      await comoUsuario(sql, e.donoId, async (tx) => {
        await tx`select public.avancar_onboarding(3::smallint)`;
        const [a] =
          await tx`select onboarding_passo, onboarding_iniciado_em, onboarding_concluido_em
          from public.empresas where id = ${e.empresaId}`;
        expect(a!.onboarding_passo).toBe(3);
        expect(a!.onboarding_iniciado_em).not.toBeNull();
        expect(a!.onboarding_concluido_em).toBeNull();
        await tx`savepoint s`;
        await esperarErroSql(tx`select public.avancar_onboarding(4::smallint)`, '23514');
        await tx`rollback to savepoint s`;
        await tx`update public.pacotes set preco_confirmado_em = now()
          where id = (select id from public.pacotes order by ordem limit 1)`;
        await tx`select public.avancar_onboarding(4::smallint)`;
        await tx`select public.avancar_onboarding(5::smallint)`;
        const [b] = await tx`select onboarding_passo, onboarding_concluido_em
          from public.empresas where id = ${e.empresaId}`;
        expect(b!.onboarding_passo).toBe(5);
        expect(b!.onboarding_concluido_em).not.toBeNull();
        // voltar não "desconclui"
        await tx`select public.avancar_onboarding(2::smallint)`;
        const [c] =
          await tx`select onboarding_concluido_em from public.empresas where id = ${e.empresaId}`;
        expect(c!.onboarding_concluido_em).toEqual(b!.onboarding_concluido_em);
        const [n] = await tx`select count(*)::int as n from public.auditoria
          where empresa_id = ${e.empresaId} and acao = 'onboarding.concluido'`;
        expect(n!.n).toBe(1);
      });
    });
  });

  it('link na bio, link testado e dispensar o checklist (por usuário)', async () => {
    await comModelo(async (e) => {
      await comoUsuario(sql, e.donoId, async (tx) => {
        await tx`select public.marcar_link_na_bio(true)`;
        await tx`select public.marcar_link_testado()`;
        await tx`select public.dispensar_checklist(true)`;
        const [a] = await tx`select link_na_bio_em, link_testado_em from public.empresas
          where id = ${e.empresaId}`;
        expect(a!.link_na_bio_em).not.toBeNull();
        expect(a!.link_testado_em).not.toBeNull();
        const [u] =
          await tx`select checklist_dispensado_em from public.usuarios where id = ${e.donoId}`;
        expect(u!.checklist_dispensado_em).not.toBeNull();
        await tx`select public.marcar_link_na_bio(false)`;
        await tx`select public.dispensar_checklist(false)`;
        const [b] = await tx`select link_na_bio_em from public.empresas where id = ${e.empresaId}`;
        expect(b!.link_na_bio_em).toBeNull();
        const [v] =
          await tx`select checklist_dispensado_em from public.usuarios where id = ${e.donoId}`;
        expect(v!.checklist_dispensado_em).toBeNull();
      });
      // vendedor também pode dispensar o próprio checklist
      await comoUsuario(sql, e.vendedorId, (tx) => tx`select public.dispensar_checklist(true)`);
    });
  });

  it('colunas do onboarding não são graváveis direto pelo painel', async () => {
    await comModelo(async (e) => {
      await esperarErroSql(
        comoUsuario(
          sql,
          e.donoId,
          (tx) => tx`update public.empresas set onboarding_passo = 5 where id = ${e.empresaId}`,
        ),
        '42501',
      );
    });
  });
});

describe('migração', () => {
  it('Buffet Demo (catálogo do seed) tem todos os preços confirmados', async () => {
    const r = await sql`select count(*) filter (where preco_confirmado_em is null)::int as n
      from public.pacotes p join public.empresas e on e.id = p.empresa_id where e.slug = 'buffet-demo'`;
    expect(r[0]!.n).toBe(0);
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import {
  assumirAnon,
  assumirUsuario,
  conectar,
  emTransacao,
  esperarErroSql,
  IDS,
} from '../support/db';

/*
 * Etapa 9.6: migration 20261012000001_landing. A landing lê preços só por publico.planos_vitrine
 * (anon), conta visitas por publico.landing_contar (agregado, sem nada pessoal) e grava a origem
 * do cadastro por registrar_origem_cadastro (uma vez, com auditoria).
 */

const sql = conectar();
afterAll(() => sql.end());

describe('publico.planos_vitrine', () => {
  it('anon lê só as colunas públicas dos planos ativos, sem ids e sem cupom', async () => {
    const v = await emTransacao(sql, async (tx) => {
      await assumirAnon(tx);
      const [{ v }] = (await tx`select publico.planos_vitrine() as v`) as unknown as [
        { v: Record<string, unknown> & { planos: Record<string, unknown>[] } },
      ];
      return v;
    });
    expect(v.planos.map((p) => p.codigo)).toEqual(['essencial', 'profissional']);
    expect(Object.keys(v.planos[0]!).sort()).toEqual(
      [
        'codigo',
        'nome',
        'preco_mensal_centavos',
        'preco_anual_centavos',
        'max_usuarios',
        'max_espacos',
        'whatsapp_avisos',
        'follow_up',
        'numeros_completo',
      ].sort(),
    );
    expect(v.planos[1]).toMatchObject({ preco_mensal_centavos: 24700, max_espacos: null });
    expect(Object.keys(v)).toEqual(['planos']);
  });

  it('plano desativado some da vitrine', async () => {
    const codigos = await emTransacao(sql, async (tx) => {
      await tx`update public.planos set ativo = false where codigo = 'essencial'`;
      await assumirAnon(tx);
      const [{ v }] = (await tx`select publico.planos_vitrine() as v`) as unknown as [
        { v: { planos: { codigo: string }[] } },
      ];
      return v.planos.map((p) => p.codigo);
    });
    expect(codigos).toEqual(['profissional']);
  });

  it('só anon executa; anon não lê planos, cupons nem a contagem', async () => {
    const [r] = await sql`select
      has_function_privilege('anon', 'publico.planos_vitrine()', 'execute') as anon,
      has_function_privilege('authenticated', 'publico.planos_vitrine()', 'execute') as autenticado,
      has_function_privilege('anon', 'publico.landing_contar(text)', 'execute') as contar,
      has_table_privilege('anon', 'public.planos', 'select') as planos,
      has_table_privilege('anon', 'public.cupons', 'select') as cupons,
      has_table_privilege('anon', 'public.landing_contagem', 'select') as contagem,
      has_table_privilege('authenticated', 'public.landing_contagem', 'select') as contagem_auth`;
    expect(r).toEqual({
      anon: true,
      autenticado: false,
      contar: true,
      planos: false,
      cupons: false,
      contagem: false,
      contagem_auth: false,
    });
  });
});

describe('publico.landing_contar', () => {
  it('soma por dia e evento, sem guardar nada além do total', async () => {
    const r = await emTransacao(sql, async (tx) => {
      await tx`delete from public.landing_contagem`;
      await assumirAnon(tx);
      await tx`select publico.landing_contar('visita')`;
      await tx`select publico.landing_contar('visita')`;
      await tx`select publico.landing_contar('clicou_teste')`;
      await tx`select set_config('role', 'postgres', true)`;
      const linhas = await tx`select evento, total from public.landing_contagem order by evento`;
      const [colunas] = await tx`select array_agg(column_name::text order by column_name) as c
        from information_schema.columns where table_schema = 'public'
        and table_name = 'landing_contagem'`;
      return { linhas, colunas: colunas!.c };
    });
    expect(r.linhas).toEqual([
      { evento: 'clicou_teste', total: 1 },
      { evento: 'visita', total: 2 },
    ]);
    expect(r.colunas).toEqual(['dia', 'evento', 'total']);
  });

  it('evento desconhecido é recusado', async () => {
    await esperarErroSql(
      emTransacao(sql, async (tx) => {
        await assumirAnon(tx);
        await tx`select publico.landing_contar('cpf_do_visitante')`;
      }),
      '23514',
    );
  });
});

describe('registrar_origem_cadastro', () => {
  const origem = { utm_source: 'instagram', utm_campaign: 'lancamento', ref: 'bio' };

  it('grava uma vez na própria empresa, com auditoria, e não sobrescreve', async () => {
    const r = await emTransacao(sql, async (tx) => {
      await tx`update public.empresas set origem_cadastro = null
        where id in (${IDS.empresaA}, ${IDS.empresaB})`;
      await assumirUsuario(tx, IDS.donoA);
      const [p] = await tx`select public.registrar_origem_cadastro(${tx.json(origem)}) as g`;
      const [s] =
        await tx`select public.registrar_origem_cadastro(${tx.json({ utm_source: 'google' })}) as g`;
      await tx`select set_config('role', 'postgres', true)`;
      const [a] =
        await tx`select origem_cadastro as o from public.empresas where id = ${IDS.empresaA}`;
      const [b] =
        await tx`select origem_cadastro as o from public.empresas where id = ${IDS.empresaB}`;
      const aud = await tx`select dados from public.auditoria
        where empresa_id = ${IDS.empresaA} and acao = 'empresa.origem_cadastro'`;
      return { p: p!.g, s: s!.g, a: a!.o, b: b!.o, aud };
    });
    expect(r.p).toBe(true);
    expect(r.s).toBe(false);
    expect(r.a).toEqual(origem);
    expect(r.b).toBeNull();
    expect(r.aud).toEqual([{ dados: { origem } }]);
  });

  it('recusa chave desconhecida, valor longo, vendedor e sem sessão', async () => {
    for (const ruim of [{ email: 'a@b.c' }, { utm_source: 'x'.repeat(61) }, { ref: 1 }]) {
      await esperarErroSql(
        emTransacao(sql, async (tx) => {
          await tx`update public.empresas set origem_cadastro = null where id = ${IDS.empresaA}`;
          await assumirUsuario(tx, IDS.donoA);
          await tx`select public.registrar_origem_cadastro(${tx.json(ruim)})`;
        }),
        '23514',
      );
    }
    await esperarErroSql(
      emTransacao(sql, async (tx) => {
        await assumirUsuario(tx, IDS.vendedorA);
        await tx`select public.registrar_origem_cadastro(${tx.json(origem)})`;
      }),
      '42501',
    );
    await esperarErroSql(
      emTransacao(sql, async (tx) => {
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select public.registrar_origem_cadastro(${tx.json(origem)})`;
      }),
      '42501',
    );
  });

  it('anon não executa', async () => {
    const [r] = await sql`select has_function_privilege('anon',
      'public.registrar_origem_cadastro(jsonb)', 'execute') as anon`;
    expect(r!.anon).toBe(false);
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { assumirUsuario, conectar, emTransacao, esperarErroSql, IDS } from '../support/db';

/*
 * Etapa 9.5 (A.6): as 5 policies reescritas com (select auth.uid()) / (select
 * empresa_do_usuario()) mantêm a mesma regra. Cada uma: o próprio usuário vê/grava o que é dele;
 * colega da mesma empresa e usuário de outra empresa não. Tudo em transação desfeita.
 */

const sql = conectar();
afterAll(() => sql.end());

type Linha = { n: number };

async function contar(tx: Parameters<Parameters<typeof emTransacao>[1]>[0], q: string) {
  const [r] = (await tx.unsafe(q)) as unknown as Linha[];
  return r!.n;
}

/** Prepara linhas como administrador e devolve, para cada usuário, quantas ele enxerga. */
async function visiveis(
  tabela: string,
  preparar?: (tx: Parameters<Parameters<typeof emTransacao>[1]>[0]) => Promise<void>,
) {
  const resultado: Record<string, number> = {};
  for (const u of [IDS.donoA, IDS.vendedorA, IDS.donoB]) {
    resultado[u] = await emTransacao(sql, async (tx) => {
      await preparar?.(tx);
      await assumirUsuario(tx, u);
      return contar(tx, `select count(*)::int as n from public.${tabela}`);
    });
  }
  return resultado;
}

async function totalPorUsuario(
  tabela: string,
  join = '',
  coluna = 'usuario_id',
  preparar?: (tx: Parameters<Parameters<typeof emTransacao>[1]>[0]) => Promise<void>,
) {
  const resultado: Record<string, number> = {};
  for (const u of [IDS.donoA, IDS.vendedorA, IDS.donoB]) {
    resultado[u] = await emTransacao(sql, async (tx) => {
      await preparar?.(tx);
      return contar(
        tx,
        `select count(*)::int as n from public.${tabela} t ${join} where ${coluna} = '${u}'`,
      );
    });
  }
  return resultado;
}

describe('policies de leitura dos próprios dados (avisos, entregas, push, preferências)', () => {
  it('avisos_select_proprios: cada um vê só os próprios avisos', async () => {
    const vistos = await visiveis('avisos');
    const donos = await totalPorUsuario('avisos');
    expect(vistos).toEqual(donos);
    expect(vistos[IDS.donoA]).toBeGreaterThan(0);
    expect(vistos[IDS.vendedorA]).toBeGreaterThan(0);
  });

  it('avisos_entregas_select_proprias: entrega só para o dono do aviso', async () => {
    const preparar = async (tx: Parameters<Parameters<typeof emTransacao>[1]>[0]) => {
      await tx`insert into public.avisos_entregas (empresa_id, aviso_id, canal)
        select a.empresa_id, a.id, 'push' from public.avisos a
        where a.usuario_id in (${IDS.donoA}, ${IDS.vendedorA}, ${IDS.donoB})
        on conflict do nothing`;
    };
    const vistos = await visiveis('avisos_entregas', preparar);
    const donos = await totalPorUsuario(
      'avisos_entregas',
      'join public.avisos a on a.id = t.aviso_id',
      'a.usuario_id',
      preparar,
    );
    expect(vistos).toEqual(donos);
    expect(vistos[IDS.donoA]).toBeGreaterThan(0);
  });

  it('push_inscricoes_select_proprias: inscrição só do próprio aparelho', async () => {
    const preparar = async (tx: Parameters<Parameters<typeof emTransacao>[1]>[0]) => {
      for (const [u, e] of [
        [IDS.donoA, IDS.empresaA],
        [IDS.vendedorA, IDS.empresaA],
        [IDS.donoB, IDS.empresaB],
      ] as const) {
        await tx`insert into public.push_inscricoes (empresa_id, usuario_id, endpoint, p256dh, auth)
          values (${e}, ${u}, ${`https://push.test/${u}`}, 'p256dh-chave-teste', 'auth-teste')`;
      }
    };
    const vistos = await visiveis('push_inscricoes', preparar);
    expect(vistos).toEqual({ [IDS.donoA]: 1, [IDS.vendedorA]: 1, [IDS.donoB]: 1 });
  });

  it('preferencias_avisos_select_proprias: preferências só do próprio usuário', async () => {
    const vistos = await visiveis('preferencias_avisos');
    const donos = await totalPorUsuario('preferencias_avisos');
    expect(vistos).toEqual(donos);
    expect(vistos[IDS.vendedorA]).toBe(1);
  });
});

describe('auditoria_insert_proprio', () => {
  const inserir = (empresa: string, usuario: string | null) =>
    emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.vendedorA);
      await tx`insert into public.auditoria (empresa_id, usuario_id, acao, entidade)
        values (${empresa}, ${usuario}, 'teste.policy', 'teste')`;
      return true;
    });

  it('grava em nome próprio, na própria empresa', async () => {
    expect(await inserir(IDS.empresaA, IDS.vendedorA)).toBe(true);
  });

  it('recusa em nome de outro usuário, de outra empresa ou sem usuário', async () => {
    await esperarErroSql(inserir(IDS.empresaA, IDS.donoA), '42501');
    await esperarErroSql(inserir(IDS.empresaB, IDS.vendedorA), '42501');
    await esperarErroSql(inserir(IDS.empresaA, null), '42501');
  });
});

describe('o planejador avalia a identidade uma vez (initPlan), não por linha', () => {
  it.each(['avisos', 'push_inscricoes', 'preferencias_avisos', 'avisos_entregas'])(
    '%s',
    async (tabela) => {
      const plano = await emTransacao(sql, async (tx) => {
        await assumirUsuario(tx, IDS.donoA);
        const linhas = (await tx.unsafe(`explain select * from public.${tabela}`)) as unknown as {
          'QUERY PLAN': string;
        }[];
        return linhas.map((l) => l['QUERY PLAN']).join('\n');
      });
      expect(plano).toMatch(/InitPlan/);
    },
  );
});

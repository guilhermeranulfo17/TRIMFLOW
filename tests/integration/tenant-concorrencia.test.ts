import { sql as q } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { criarComAnon } from '@/server/db/anon';
import { criarDb } from '@/server/db/client';
import { empresas, leads } from '@/server/db/schema';
import { criarComUsuario, criarLerComo } from '@/server/db/tenant';
import { IDS, urlBancoTeste } from '../support/db';

/*
 * Etapa 9.5 (A.3): comUsuario numa conexão reservada, com BEGIN + identidade numa ida e as
 * consultas em pipeline. Requisições intercaladas de dois usuários de empresas diferentes, no
 * MESMO pool pequeno (as conexões são reaproveitadas o tempo todo), não podem ver dado do outro
 * nem herdar claims da conexão anterior: set_config(..., true) vale só até o fim da transação.
 */

const { db, sql } = criarDb(urlBancoTeste(), { max: 2 });
const comUsuario = criarComUsuario(db);
const lerComo = criarLerComo(db);
const comAnon = criarComAnon(db);
afterAll(() => sql.end());

const USUARIOS = [
  { id: IDS.donoA, empresa: IDS.empresaA },
  { id: IDS.donoB, empresa: IDS.empresaB },
] as const;

type Linha = Record<string, unknown>;

/** Identidade vista pela conexão administrativa (sem comUsuario): não pode sobrar nada. */
async function identidadeSolta() {
  const [r] = (await db.execute(
    q`select current_user as papel,
             coalesce(current_setting('request.jwt.claims', true), '') as claims,
             coalesce(current_setting('orkestra.suporte_admin', true), '') as suporte`,
  )) as unknown as Linha[];
  return r!;
}

describe('comUsuario em pipeline: concorrência no mesmo pool', () => {
  it('requisições intercaladas de duas empresas não se misturam', async () => {
    const rodadas = Array.from({ length: 40 }, (_, i) => USUARIOS[i % 2]!);
    const resultados = await Promise.all(
      rodadas.map((u, i) =>
        comUsuario(u.id, async (tx) => {
          // várias consultas da mesma requisição em pipeline, com pausas para intercalar
          const [quem, emp, alheios, todas] = await Promise.all([
            tx.execute(
              q`select auth.uid() as uid, public.empresa_do_usuario() as empresa,
                       current_setting('request.jwt.claims', true) as claims,
                       pg_sleep(${(i % 5) / 1000})`,
            ),
            tx.select({ id: empresas.id }).from(empresas),
            tx.execute(
              q`select count(*)::int as n from public.leads where empresa_id <> ${u.empresa}`,
            ),
            tx.select({ empresa: leads.empresaId }).from(leads),
          ]);
          return { u, quem: (quem as unknown as Linha[])[0]!, emp, alheios, todas };
        }),
      ),
    );
    for (const r of resultados) {
      expect(r.quem.uid).toBe(r.u.id);
      expect(r.quem.empresa).toBe(r.u.empresa);
      expect(JSON.parse(String(r.quem.claims)).sub).toBe(r.u.id);
      expect(r.emp).toEqual([{ id: r.u.empresa }]);
      expect((r.alheios as unknown as Linha[])[0]!.n).toBe(0);
      expect(r.todas.every((l) => l.empresa === r.u.empresa)).toBe(true);
    }
    expect(await identidadeSolta()).toMatchObject({ papel: 'postgres', claims: '', suporte: '' });
  });

  it('lerComo (uma ida) intercalado com comUsuario e comAnon', async () => {
    const tarefas = Array.from({ length: 30 }, (_, i) => {
      const u = USUARIOS[i % 2]!;
      if (i % 3 === 0) {
        return comAnon(async (tx) => ({
          tipo: 'anon' as const,
          u,
          linhas: await tx.execute(
            q`select current_user as papel, auth.uid() as uid,
                     has_table_privilege('public.empresas', 'select') as le_empresas`,
          ),
        }));
      }
      if (i % 3 === 1) {
        return lerComo(u.id, [
          q`select auth.uid() as uid, pg_sleep(${(i % 4) / 1000})`,
          q`select id from public.empresas`,
        ]).then((linhas) => ({ tipo: 'ler' as const, u, linhas }));
      }
      return comUsuario(u.id, async (tx) => ({
        tipo: 'tx' as const,
        u,
        linhas: await tx.select({ id: empresas.id }).from(empresas),
      }));
    });
    for (const r of await Promise.all(tarefas)) {
      if (r.tipo === 'anon') {
        const [l] = r.linhas as unknown as Linha[];
        expect(l).toMatchObject({ papel: 'anon', uid: null, le_empresas: false });
      } else if (r.tipo === 'ler') {
        const [quem, emps] = r.linhas as Linha[][];
        expect(quem![0]!.uid).toBe(r.u.id);
        expect(emps).toEqual([{ id: r.u.empresa }]);
      } else {
        expect(r.linhas).toEqual([{ id: r.u.empresa }]);
      }
    }
    expect(await identidadeSolta()).toMatchObject({ papel: 'postgres', claims: '', suporte: '' });
  });

  it('erro no meio da transação: rollback e a conexão volta sem identidade', async () => {
    const umaConexao = criarDb(urlBancoTeste(), { max: 1 });
    try {
      const com = criarComUsuario(umaConexao.db, { suporteAdmin: () => 'equipe@orkestra.local' });
      await expect(
        com(IDS.donoA, async (tx) => {
          await tx.execute(q`select 1`);
          await tx.execute(q`select 1/0`);
        }),
      ).rejects.toThrow();
      // a mesma (única) conexão, já devolvida ao pool
      const [r] = (await umaConexao.db.execute(
        q`select current_user as papel,
                 coalesce(current_setting('request.jwt.claims', true), '') as claims,
                 coalesce(current_setting('orkestra.suporte_admin', true), '') as suporte,
                 now() = statement_timestamp() as fora_de_transacao`,
      )) as unknown as Linha[];
      expect(r).toMatchObject({ papel: 'postgres', claims: '', suporte: '' });
      // e o próximo usuário na mesma conexão só vê a própria empresa
      const linhas = await com(IDS.donoB, (tx) => tx.select({ id: empresas.id }).from(empresas));
      expect(linhas).toEqual([{ id: IDS.empresaB }]);
    } finally {
      await umaConexao.sql.end();
    }
  });

  it('erro numa leitura de uma ida não deixa identidade na conexão', async () => {
    const umaConexao = criarDb(urlBancoTeste(), { max: 1 });
    try {
      const ler = criarLerComo(umaConexao.db);
      await expect(ler(IDS.donoA, [q`select 1`, q`select 1/0`])).rejects.toThrow();
      const [r] = (await umaConexao.db.execute(
        q`select current_user as papel,
                 coalesce(current_setting('request.jwt.claims', true), '') as claims`,
      )) as unknown as Linha[];
      expect(r).toMatchObject({ papel: 'postgres', claims: '' });
    } finally {
      await umaConexao.sql.end();
    }
  });

  it('id de usuário inválido é recusado antes de ir ao banco', async () => {
    await expect(comUsuario("x' or true --", async () => 1)).rejects.toThrow(/inválido/);
  });
});

describe('parâmetros inline: o valor chega intacto ao banco', () => {
  const valores = [
    "O'Brien",
    'barra \\ invertida \\\\ e \\x41',
    "\\'; drop table empresas; --",
    'acentuação, emoji 🎉 e $1 $$ $tag$',
    'linha\nnova\ttab',
    '',
  ];

  it('strings', async () => {
    const lidos = await comUsuario(IDS.donoA, (tx) =>
      Promise.all(valores.map((v) => tx.execute(q`select ${v}::text as v`))),
    );
    expect(lidos.map((r) => (r as unknown as Linha[])[0]!.v)).toEqual(valores);
  });

  it('json, array, número, booleano, nulo e data', async () => {
    const obj = { a: "x'y", b: 'c\\d', c: [1, 2] };
    const [r] = (await comUsuario(IDS.donoA, (tx) =>
      tx.execute(
        q`select ${JSON.stringify(obj)}::jsonb as j, ${q.param(['a', 'b"c', "d'e", 'f\\g'])}::text[] as arr,
                 ${-12.5}::numeric as num, ${true} as b, ${null}::text as nada,
                 ${new Date('2026-10-03T12:00:00Z')}::timestamptz = '2026-10-03T12:00:00Z' as data_ok`,
      ),
    )) as unknown as Linha[];
    expect(r!.j).toEqual(obj);
    expect(r!.arr).toEqual(['a', 'b"c', "d'e", 'f\\g']);
    expect(Number(r!.num)).toBe(-12.5);
    expect(r!.b).toBe(true);
    expect(r!.nada).toBeNull();
    expect(r!.data_ok).toBe(true);
  });
});

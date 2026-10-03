import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { assumirUsuario, conectar, emTransacao, esperarErroSql, IDS } from '../support/db';

/*
 * Etapa 9.5 (C): migration 20261010000003_conta_google. Quem entra pelo Google chega em
 * auth.users sem nome_buffet (o trigger não cria nada) e completa a conta com
 * completar_conta_dono. O cadastro por e-mail (trigger) continua igual.
 */

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;

/** O que o GoTrue grava quando alguém entra pelo Google (metadados do Google, sem buffet). */
async function usuarioGoogle(tx: Tx, email: string | null = `g-${randomUUID()}@gmail.test`) {
  const id = randomUUID();
  await tx`insert into auth.users (id, email, raw_user_meta_data, aud, role)
    values (${id}, ${email}, ${tx.json({ full_name: 'Gabi Google', email_verified: true })},
            'authenticated', 'authenticated')`;
  return id;
}

const completar = (tx: Tx, buffet = 'Buffet do Google') =>
  tx`select public.completar_conta_dono('Gabi Google', ${buffet}, '+5534991355450',
       'eventos', 'buffet-do-google') as empresa`;

describe('completar_conta_dono', () => {
  it('o Google sozinho não cria conta; completar cria empresa em teste, dono e auditoria', async () => {
    const r = await emTransacao(sql, async (tx) => {
      const id = await usuarioGoogle(tx);
      const [antes] = await tx`select count(*)::int as n from public.usuarios where id = ${id}`;
      await assumirUsuario(tx, id);
      const [{ empresa }] = (await completar(tx)) as unknown as [{ empresa: string }];
      await tx`select set_config('role', 'postgres', true)`;
      const [u] = await tx`select perfil, ativo, empresa_id from public.usuarios where id = ${id}`;
      const [e] = await tx`select segmento, plano, slug,
        round(extract(epoch from (trial_ate - now())) / 86400) as dias from public.empresas
        where id = ${empresa}`;
      const [a] = await tx`select acao, dados from public.auditoria where empresa_id = ${empresa}`;
      return { antes: antes!.n, empresa, u, e, a };
    });
    expect(r.antes).toBe(0);
    expect(r.u).toMatchObject({ perfil: 'dono', ativo: true, empresa_id: r.empresa });
    expect(r.e).toMatchObject({ segmento: 'eventos', plano: 'trial', slug: 'buffet-do-google' });
    expect(Number(r.e!.dias)).toBe(14);
    expect(r.a).toMatchObject({ acao: 'conta.criada', dados: { origem: 'google' } });
  });

  it('é idempotente: a segunda chamada devolve a mesma empresa e não cria outra', async () => {
    const r = await emTransacao(sql, async (tx) => {
      const id = await usuarioGoogle(tx);
      await assumirUsuario(tx, id);
      const [p] = (await completar(tx)) as unknown as [{ empresa: string }];
      const [s] = (await completar(tx, 'Outro nome')) as unknown as [{ empresa: string }];
      await tx`select set_config('role', 'postgres', true)`;
      const [n] =
        await tx`select count(*)::int as n from public.empresas where slug like 'buffet-do-google%'`;
      return { p: p.empresa, s: s.empresa, n: n!.n };
    });
    expect(r.s).toBe(r.p);
    expect(r.n).toBe(1);
  });

  it('usuário que já tem conta recebe a própria empresa e nada muda em outra', async () => {
    const r = await emTransacao(sql, async (tx) => {
      const [antes] = await tx`select count(*)::int as n from public.empresas`;
      await assumirUsuario(tx, IDS.donoB);
      const [{ empresa }] = (await completar(tx)) as unknown as [{ empresa: string }];
      await tx`select set_config('role', 'postgres', true)`;
      const [depois] = await tx`select count(*)::int as n from public.empresas`;
      const [b] = await tx`select nome from public.empresas where id = ${IDS.empresaB}`;
      return { empresa, antes: antes!.n, depois: depois!.n, b };
    });
    expect(r.empresa).toBe(IDS.empresaB);
    expect(r.depois).toBe(r.antes);
    expect(r.b!.nome).not.toBe('Buffet do Google');
  });

  it('recusa sem sessão, sem e-mail e com WhatsApp inválido', async () => {
    await esperarErroSql(
      emTransacao(sql, async (tx) => {
        await tx`select set_config('role', 'authenticated', true)`;
        await completar(tx);
      }),
      '42501',
    );
    await esperarErroSql(
      emTransacao(sql, async (tx) => {
        const id = await usuarioGoogle(tx, null);
        await assumirUsuario(tx, id);
        await completar(tx);
      }),
      '23502',
    );
    await esperarErroSql(
      emTransacao(sql, async (tx) => {
        const id = await usuarioGoogle(tx);
        await assumirUsuario(tx, id);
        await tx`select public.completar_conta_dono('Gabi', 'Buffet', '34991', 'eventos', 'b')`;
      }),
      '23514',
    );
  });

  it('anon não executa; a função interna não é executável por ninguém da API', async () => {
    const [r] = await sql`select
      has_function_privilege('anon', 'public.completar_conta_dono(text, text, text, public.segmento_empresa, text)', 'execute') as anon,
      has_function_privilege('authenticated', 'public._criar_conta_dono(uuid, text, jsonb, text)', 'execute') as interna`;
    expect(r).toEqual({ anon: false, interna: false });
  });
});

describe('cadastro por e-mail continua pelo trigger (regressão)', () => {
  it('signup com os dados do buffet cria a conta com origem "cadastro"', async () => {
    const r = await emTransacao(sql, async (tx) => {
      const id = randomUUID();
      await tx`insert into auth.users (id, email, raw_user_meta_data, aud, role)
        values (${id}, 'email@exemplo.test', ${tx.json({
          nome: 'Ana',
          nome_buffet: 'Buffet Email',
          whatsapp_e164: '+5534991355450',
          segmento: 'infantil',
          slug_base: 'buffet-email',
        })}, 'authenticated', 'authenticated')`;
      const [u] = await tx`select empresa_id from public.usuarios where id = ${id}`;
      const [a] = await tx`select dados from public.auditoria where empresa_id = ${u!.empresa_id}`;
      return a!.dados;
    });
    expect(r).toMatchObject({ origem: 'cadastro', segmento: 'infantil', slug: 'buffet-email' });
  });

  it('signup incompleto continua recusado', async () => {
    await esperarErroSql(
      emTransacao(sql, async (tx) => {
        await tx`insert into auth.users (id, email, raw_user_meta_data, aud, role)
          values (${randomUUID()}, 'x@exemplo.test', ${tx.json({ nome_buffet: 'Só o buffet' })},
                  'authenticated', 'authenticated')`;
      }),
      '23502',
    );
  });
});

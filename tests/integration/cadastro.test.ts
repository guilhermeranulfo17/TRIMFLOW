import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { conectar, emTransacao, esperarErroSql } from '../support/db';

const sql = conectar();
afterAll(() => sql.end());

type Meta = Record<string, unknown>;

function metaValida(extra: Meta = {}): Meta {
  return {
    nome: 'Ana Souza',
    nome_buffet: 'Buffet Alegria & Cia',
    whatsapp_e164: '+5534991355450',
    segmento: 'infantil',
    slug_base: 'buffet-alegria-cia',
    ...extra,
  };
}

/** Simula o insert que o GoTrue faz em auth.users no signUp. */
function inserirUsuarioAuth(
  tx: postgres.Sql | postgres.TransactionSql,
  id: string,
  email: string,
  meta: Meta,
) {
  return tx`insert into auth.users (id, email, raw_user_meta_data, aud, role)
            values (${id}, ${email}, ${tx.json(meta as postgres.JSONValue)}, 'authenticated', 'authenticated')`;
}

async function nadaGravado(id: string, email: string) {
  const [r] = await sql`
    select
      (select count(*)::int from auth.users where id = ${id} or email = ${email}) as auth,
      (select count(*)::int from public.usuarios where id = ${id}) as usuarios,
      (select count(*)::int from public.empresas where email = ${email}) as empresas,
      (select count(*)::int from public.auditoria a
         join public.empresas e on e.id = a.empresa_id where e.email = ${email}) as auditoria`;
  expect(r).toEqual({ auth: 0, usuarios: 0, empresas: 0, auditoria: 0 });
}

describe('cadastro do dono (trigger em auth.users)', () => {
  it('cria empresa em trial de 14 dias, dono e auditoria juntos', async () => {
    const id = randomUUID();
    const r = await emTransacao(sql, async (tx) => {
      await inserirUsuarioAuth(tx, id, 'Ana@Exemplo.test', metaValida());
      const [usuario] = await tx`select * from public.usuarios where id = ${id}`;
      const [empresa] = await tx`
        select *, round(extract(epoch from (trial_ate - now())) / 86400) as dias_trial
        from public.empresas where id = ${usuario?.empresa_id}`;
      const auditoria =
        await tx`select * from public.auditoria where empresa_id = ${usuario?.empresa_id}`;
      return { usuario, empresa, auditoria };
    });

    expect(r.usuario).toMatchObject({
      nome: 'Ana Souza',
      email: 'ana@exemplo.test',
      perfil: 'dono',
      ativo: true,
      whatsapp_e164: '+5534991355450',
    });
    expect(r.empresa).toMatchObject({
      nome: 'Buffet Alegria & Cia',
      slug: 'buffet-alegria-cia',
      segmento: 'infantil',
      plano: 'trial',
      fuso: 'America/Sao_Paulo',
      email: 'ana@exemplo.test',
    });
    expect(Number(r.empresa?.dias_trial)).toBe(14);
    expect(r.auditoria).toHaveLength(1);
    expect(r.auditoria[0]).toMatchObject({
      acao: 'conta.criada',
      entidade: 'empresa',
      usuario_id: id,
    });
  });

  it('segmento inválido: nada fica gravado (nem o usuário do Auth)', async () => {
    const id = randomUUID();
    const email = `falha-segmento-${id}@exemplo.test`;
    await esperarErroSql(
      inserirUsuarioAuth(sql, id, email, metaValida({ segmento: 'pizzaria' })),
      '22P02',
    );
    await nadaGravado(id, email);
  });

  it('WhatsApp ausente: nada fica gravado', async () => {
    const id = randomUUID();
    const email = `falha-whats-${id}@exemplo.test`;
    await esperarErroSql(
      inserirUsuarioAuth(sql, id, email, metaValida({ whatsapp_e164: '' })),
      '23502',
    );
    await nadaGravado(id, email);
  });

  it('falha no meio (usuário inválido depois de criar a empresa): a empresa também é desfeita', async () => {
    const id = randomUUID();
    const email = `falha-meio-${id}@exemplo.test`;
    // nome com 1 caractere passa pela empresa, mas viola o check de usuarios.nome
    await esperarErroSql(inserirUsuarioAuth(sql, id, email, metaValida({ nome: 'A' })), '23514');
    await nadaGravado(id, email);
  });

  it('WhatsApp fora do padrão E.164: nada fica gravado', async () => {
    const id = randomUUID();
    const email = `falha-e164-${id}@exemplo.test`;
    await esperarErroSql(
      inserirUsuarioAuth(sql, id, email, metaValida({ whatsapp_e164: '34991355450' })),
      '23514',
    );
    await nadaGravado(id, email);
  });

  it('signup sem nome_buffet (ex.: convite futuro) não cria empresa', async () => {
    const id = randomUUID();
    const criados = await emTransacao(sql, async (tx) => {
      await inserirUsuarioAuth(tx, id, `convite-${id}@exemplo.test`, { nome: 'Convidado' });
      const [r] = await tx`select count(*)::int as n from public.usuarios where id = ${id}`;
      return r?.n;
    });
    expect(criados).toBe(0);
  });
});

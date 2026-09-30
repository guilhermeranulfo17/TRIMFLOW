import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { comoUsuario, conectar, emTransacao, esperarErroSql, IDS } from '../support/db';

const sql = conectar();
afterAll(() => sql.end());

async function cadastrar(tx: postgres.TransactionSql, slugBase: string): Promise<string> {
  const id = randomUUID();
  await tx`insert into auth.users (id, email, raw_user_meta_data)
           values (${id}, ${`${id}@exemplo.test`}, ${tx.json({
             nome: 'Fulano de Tal',
             nome_buffet: 'Buffet Demo',
             whatsapp_e164: '+5534991355450',
             segmento: 'infantil',
             slug_base: slugBase,
           })})`;
  const [r] = await tx`select e.slug from public.empresas e
                       join public.usuarios u on u.empresa_id = e.id where u.id = ${id}`;
  return r?.slug as string;
}

describe('slug da empresa', () => {
  it('slug duplicado recebe sufixo numérico', async () => {
    const slugs = await emTransacao(sql, async (tx) => [
      await cadastrar(tx, 'buffet-demo'), // já existe no seed
      await cadastrar(tx, 'buffet-demo'),
      await cadastrar(tx, 'buffet-novo'),
    ]);
    expect(slugs).toEqual(['buffet-demo-2', 'buffet-demo-3', 'buffet-novo']);
  });

  it('sufixo respeita o limite de 60 caracteres', async () => {
    const base = `${'a'.repeat(58)}-b`; // 60 caracteres
    const slugs = await emTransacao(sql, async (tx) => [
      await cadastrar(tx, base),
      await cadastrar(tx, base),
    ]);
    expect(slugs[0]).toBe(base);
    expect(slugs[1]).toBe(`${'a'.repeat(58)}-2`);
    expect(slugs[1]?.length).toBeLessThanOrEqual(60);
  });

  it('base inválida é rejeitada', async () => {
    for (const base of ['ab', 'Com-Maiuscula', 'com_underscore', '-hifen', '']) {
      await emTransacao(sql, (tx) => esperarErroSql(cadastrar(tx, base), '22023'));
    }
  });

  it('resolver_slug_disponivel não é executável pelo usuário do painel', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(tx`select public.resolver_slug_disponivel('qualquer')`, '42501'),
    );
  });
});

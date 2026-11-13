import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { CONTAS_APRESENTACAO } from '@/domain/apresentacao/contas';
import { criarApresentacao, listarApresentacoes } from '@/server/apresentacao/criar';
import { criarDb } from '@/server/db/client';
import type { AuthDemo } from '@/server/demo/recriar';
import { listarEmpresasInternas } from '@/server/interno/carregar';
import { comoUsuario, conectar, urlBancoTeste } from '../support/db';

/*
 * Contas de apresentação: uma por modelo, com catálogo e 60 dias de dados fictícios, de
 * cortesia (situação "ativo"), editáveis pelo dono e fora da lista do /interno. Recriar apaga e
 * monta de novo; slug de empresa real é recusado.
 */

process.env.DATABASE_URL ??= urlBancoTeste();
const sql = conectar();
const { db, sql: sqlDb } = criarDb(urlBancoTeste(), { max: 2 });

const authFalso: AuthDemo = {
  async garantirUsuario(email) {
    const [u] = await sql`select id from auth.users where email = ${email}`;
    if (u) return u.id as string;
    const id = randomUUID();
    await sql`insert into auth.users (id, email, raw_app_meta_data, aud, role)
      values (${id}, ${email}, ${sql.json({ apresentacao: true })}, 'authenticated', 'authenticated')`;
    return id;
  },
  async hashDeEntrada() {
    return 'hash-falso';
  },
};
const deps = { db, auth: authFalso };

afterAll(async () => {
  const contas = await sql`select id from public.empresas where eh_apresentacao`;
  for (const c of contas) {
    await sql.begin(async (tx) => {
      await tx`select set_config('orkestra.permitir_escrita', '1', true)`;
      await tx`delete from public.cobranca_eventos where empresa_id = ${c.id}`;
      await tx`delete from public.usuarios where empresa_id = ${c.id}`;
      await tx`delete from public.empresas where id = ${c.id}`;
    });
  }
  await sql`delete from auth.users where email like 'apresentacao-%@orkestra.invalid'`;
  await sql.end();
  await sqlDb.end();
});

async function contagens(empresa: string) {
  const [c] = await sql`select
    (select count(*)::int from public.leads where empresa_id = ${empresa}) as leads,
    (select count(*)::int from public.orcamentos where empresa_id = ${empresa} and conteudo is not null) as propostas,
    (select count(*)::int from public.reservas where empresa_id = ${empresa} and tipo = 'confirmada') as reservas,
    (select count(*)::int from public.pacotes where empresa_id = ${empresa} and preco_confirmado_em is null) as sem_preco,
    (select count(*)::int from public.pacotes where empresa_id = ${empresa}) as pacotes,
    (select count(*)::int from public.funil_eventos where empresa_id = ${empresa}) as funil,
    (select count(*)::int from public.tarefas where empresa_id = ${empresa}) as tarefas,
    (select count(*)::int from public.contratos where empresa_id = ${empresa}) as contratos,
    (select count(*)::int from public.feriados where empresa_id = ${empresa} and ajuste_bp is not null) as especiais,
    (select e.plano::text from public.empresas e where e.id = ${empresa}) as plano,
    (select e.isenta from public.empresas e where e.id = ${empresa}) as isenta,
    (select e.segmento::text from public.empresas e where e.id = ${empresa}) as segmento`;
  return c!;
}

describe('contas de apresentação', () => {
  it.each(CONTAS_APRESENTACAO.map((c) => [c.chave, c] as const))(
    'monta a conta %s completa, de cortesia e com o segmento certo',
    async (_chave, conta) => {
      const r = await criarApresentacao(deps, conta.chave);
      expect(r.leads).toBeGreaterThanOrEqual(50);
      const c = await contagens(r.empresaId);
      expect(c.leads).toBeGreaterThanOrEqual(50);
      expect(c.propostas).toBeGreaterThan(20);
      expect(c.reservas).toBeGreaterThan(0);
      expect(c.pacotes).toBeGreaterThan(0);
      expect(c.sem_preco).toBe(0);
      expect(c.funil).toBeGreaterThan(300);
      expect(c.tarefas).toBeGreaterThan(0);
      expect(c.contratos).toBe(1);
      expect(c.especiais).toBe(1);
      expect(c.isenta).toBe(true);
      expect(c.plano).toBe('ativo');
      expect(c.segmento).toBe(conta.segmento);
    },
  );

  it('o dono edita (não é somente leitura como a demo)', async () => {
    const [linha] = (await sql`select e.id, u.id as usuario from public.empresas e
      join public.usuarios u on u.empresa_id = e.id
      where e.slug = 'apresentacao-casamento'`) as unknown as { id: string; usuario: string }[];
    const { id, usuario } = linha!;
    const n = await comoUsuario(sql, usuario, async (tx) => {
      const r =
        await tx`update public.pacotes set nome = nome || ' ' where empresa_id = ${id} returning 1`;
      return r.length;
    });
    expect(n).toBeGreaterThan(0);
  });

  it('recriar apaga e monta de novo (mesmo slug, dados novos)', async () => {
    const [antes] = await sql`select id from public.empresas where slug = 'apresentacao-infantil'`;
    const r = await criarApresentacao(deps, 'infantil');
    expect(r.empresaId).not.toBe(antes!.id);
    const [velha] =
      await sql`select count(*)::int as n from public.empresas where id = ${antes!.id}`;
    expect(velha!.n).toBe(0);
  });

  it('lista as quatro no /interno, fora da lista de empresas reais', async () => {
    const lista = await listarApresentacoes(db, CONTAS_APRESENTACAO);
    expect(lista.map((l) => l.conta.chave)).toEqual([
      'infantil',
      'casamento',
      'eventos',
      'domicilio',
    ]);
    expect(lista.every((l) => l.empresaId && l.usuarioId && l.leads >= 50)).toBe(true);
    const reais = await listarEmpresasInternas();
    expect(reais.some((e) => e.slug.startsWith('apresentacao-'))).toBe(false);
  });

  it('nunca usa o slug de uma empresa real', async () => {
    const [real] =
      await sql`select slug from public.empresas where not eh_apresentacao and not eh_demo limit 1`;
    await expect(
      sql`select public.apresentacao_criar(${real!.slug}, 'infantil', 'X', 'Y', 'Z', 'W', '{}',
        ${randomUUID()}, 'x@orkestra.invalid', 'Equipe', 'v1')`,
    ).rejects.toThrow(/APRESENTACAO_SLUG_OCUPADO/);
  });

  it('modelo desconhecido é recusado', async () => {
    await expect(criarApresentacao(deps, 'nao-existe')).rejects.toThrow(
      /APRESENTACAO_MODELO_INVALIDO/,
    );
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { conectar } from '../support/db';

/*
 * Etapa 9B · B.2: revisão de RLS e grants pelo catálogo do Postgres. Tabela nova, policy nova ou
 * grant novo que fuja da regra quebra este teste: decida de propósito e atualize as listas.
 */

const sql = conectar();
afterAll(() => sql.end());

/**
 * Escrita direta (insert/update/delete) do authenticated, com RLS de dono: só a configuração do
 * buffet e o catálogo. Todo o resto (leads, orçamentos, agenda, tarefas, avisos, cobrança, LGPD,
 * página pública…) é escrito só por funções security definer.
 */
const ESCRITA_DIRETA: Record<string, string[]> = {
  ajustes_dia: ['DELETE', 'INSERT', 'UPDATE'],
  auditoria: ['INSERT'],
  empresas: ['UPDATE'],
  espacos: ['DELETE', 'INSERT', 'UPDATE'],
  faixas_deslocamento: ['DELETE', 'INSERT', 'UPDATE'],
  faixas_idade: ['DELETE', 'INSERT', 'UPDATE'],
  faixas_preco: ['DELETE', 'INSERT', 'UPDATE'],
  feriados: ['DELETE', 'INSERT', 'UPDATE'],
  opcionais: ['DELETE', 'INSERT', 'UPDATE'],
  opcional_pacotes: ['DELETE', 'INSERT', 'UPDATE'],
  opcional_tipos_evento: ['DELETE', 'INSERT', 'UPDATE'],
  pacote_tipos_evento: ['DELETE', 'INSERT', 'UPDATE'],
  pacotes: ['DELETE', 'INSERT', 'UPDATE'],
  regras_comerciais: ['UPDATE'],
  secoes_cardapio: ['DELETE', 'INSERT', 'UPDATE'],
  tipos_evento: ['DELETE', 'INSERT', 'UPDATE'],
  turnos: ['DELETE', 'INSERT', 'UPDATE'],
  usuarios: ['UPDATE'],
};

describe('revisão de RLS e grants', () => {
  it('toda tabela de public e publico tem RLS ligado', async () => {
    const sem = await sql`select c.relnamespace::regnamespace::text || '.' || c.relname as t
      from pg_class c
      where c.relkind in ('r', 'p')
        and c.relnamespace::regnamespace::text in ('public', 'publico')
        and not c.relrowsecurity`;
    expect(sem.map((r) => r.t)).toEqual([]);
  });

  it('nenhuma policy para anon ou public (o link público só usa funções do schema publico)', async () => {
    const pol = await sql`select schemaname || '.' || tablename || '.' || policyname as p
      from pg_policies
      where schemaname in ('public', 'publico')
        and (roles @> '{anon}'::name[] or roles @> '{public}'::name[])`;
    expect(pol.map((r) => r.p)).toEqual([]);
  });

  it('anon não tem privilégio em nenhuma tabela', async () => {
    const tabelas = await sql`select distinct table_schema || '.' || table_name as t
      from information_schema.table_privileges
      where grantee in ('anon', 'PUBLIC') and table_schema in ('public', 'publico')`;
    expect(tabelas.map((r) => r.t)).toEqual([]);
    const colunas = await sql`select distinct table_schema || '.' || table_name as t
      from information_schema.column_privileges
      where grantee in ('anon', 'PUBLIC') and table_schema in ('public', 'publico')`;
    expect(colunas.map((r) => r.t)).toEqual([]);
  });

  it('escrita direta do authenticated só onde a regra permite', async () => {
    const linhas = await sql`
      select table_name as t, privilege_type as p from information_schema.table_privileges
      where grantee = 'authenticated' and table_schema in ('public', 'publico')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      union
      select table_name, privilege_type from information_schema.column_privileges
      where grantee = 'authenticated' and table_schema in ('public', 'publico')
        and privilege_type in ('INSERT', 'UPDATE')`;
    const atual: Record<string, string[]> = {};
    for (const { t, p } of linhas) (atual[t as string] ??= []).push(p as string);
    for (const k of Object.keys(atual)) atual[k] = [...new Set(atual[k])].sort();
    expect(atual).toEqual(ESCRITA_DIRETA);
  });

  it('função security definer sempre com search_path fixo', async () => {
    const soltas = await sql`select n.nspname || '.' || p.proname as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'publico') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                        where c like 'search_path=%')`;
    expect(soltas.map((r) => r.f)).toEqual([]);
  });

  it('o schema publico só tem função executável por anon; nenhuma por authenticated', async () => {
    const fs = await sql`select p.proname as f,
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'publico'`;
    expect(fs.filter((f) => f.auth).map((f) => f.f)).toEqual([]);
    expect(fs.filter((f) => f.anon).length).toBeGreaterThan(5);
  });
});

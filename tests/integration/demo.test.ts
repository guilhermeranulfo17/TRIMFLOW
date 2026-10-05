import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarDb } from '@/server/db/client';
import { EMAIL_DEMO, recriarDemo, type AuthDemo, type DepsDemo } from '@/server/demo/recriar';
import { assumirUsuario, conectar, urlBancoTeste } from '../support/db';

/*
 * Etapa 9B · B.5 Conta de demonstração: a recriação diária monta tudo de novo (modelo infantil e
 * 60 dias de dados), nenhuma escrita do visitante passa (nem nas funções que valem com a conta
 * suspensa), o link público da demo só cria teste e as métricas reais não mudam.
 */

process.env.DATABASE_URL ??= urlBancoTeste();
const sql = conectar();
const { db, sql: sqlDb } = criarDb(urlBancoTeste(), { max: 2 });
const SLUG = `demo-teste-${randomUUID().slice(0, 6)}`;
let usuarioDemo: string;

/** Admin API falsa: o usuário da demo direto no auth.users (o shim/Supabase local aceitam). */
const authFalso: AuthDemo = {
  async garantirUsuario(email) {
    const [u] = await sql`select id from auth.users where email = ${email}`;
    if (u) return u.id as string;
    const id = randomUUID();
    await sql`insert into auth.users (id, email, raw_app_meta_data, aud, role)
      values (${id}, ${email}, ${sql.json({ demo: true })}, 'authenticated', 'authenticated')`;
    return id;
  },
  async hashDeEntrada() {
    return 'hash-falso';
  },
};
const deps: DepsDemo = { db, auth: authFalso, slug: SLUG };

afterAll(async () => {
  const demos = await sql`select id from public.empresas where eh_demo`;
  for (const d of demos) {
    await sql`delete from public.cobranca_eventos where empresa_id = ${d.id}`;
    await sql`delete from public.usuarios where empresa_id = ${d.id}`;
    await sql`delete from public.empresas where id = ${d.id}`;
  }
  await sql`delete from auth.users where email = ${EMAIL_DEMO}`;
  await sql.end();
  await sqlDb.end();
});

async function contagens(empresa: string) {
  const [c] = await sql`select
    (select count(*)::int from public.leads where empresa_id = ${empresa} and not eh_teste) as leads,
    (select count(*)::int from public.orcamentos where empresa_id = ${empresa} and conteudo is not null) as propostas,
    (select count(*)::int from public.reservas where empresa_id = ${empresa} and tipo = 'confirmada') as reservas,
    (select count(*)::int from public.reservas where empresa_id = ${empresa} and tipo = 'pre_reserva' and status = 'ativa') as pre,
    (select count(*)::int from public.pacotes where empresa_id = ${empresa} and preco_confirmado_em is not null) as pacotes,
    (select count(*)::int from public.pacotes where empresa_id = ${empresa}) as pacotes_total,
    (select count(*)::int from public.funil_eventos where empresa_id = ${empresa}) as funil,
    (select count(*)::int from public.tarefas where empresa_id = ${empresa}) as tarefas,
    (select min(criado_em) from public.leads where empresa_id = ${empresa}) as primeiro`;
  return c!;
}

/** Erro (código:mensagem) de uma consulta como o visitante da demo, num savepoint. */
async function comoVisitante(consulta: (tx: postgres.TransactionSql) => Promise<unknown>) {
  try {
    await sql.begin(async (tx) => {
      await assumirUsuario(tx, usuarioDemo);
      await consulta(tx);
    });
  } catch (e) {
    return (e as { message?: string }).message ?? 'erro';
  }
  return 'sem erro';
}

describe('conta de demonstração', () => {
  let primeira: string;

  beforeAll(async () => {
    const r = await recriarDemo(deps);
    primeira = r.empresaId;
    const [u] = await sql`select id from public.usuarios where empresa_id = ${primeira}`;
    usuarioDemo = u!.id as string;
  });

  it('nasce completa: modelo infantil com preço confirmado e 60 dias de dados', async () => {
    const [e] = await sql`select slug, eh_demo, plano::text, onboarding_passo from public.empresas
      where id = ${primeira}`;
    expect(e).toMatchObject({ slug: SLUG, eh_demo: true, plano: 'ativo', onboarding_passo: 5 });
    const c = await contagens(primeira);
    expect(c.leads).toBeGreaterThanOrEqual(50);
    expect(c.propostas).toBeGreaterThanOrEqual(35);
    expect(c.reservas).toBeGreaterThanOrEqual(5);
    expect(c.pre).toBe(1);
    expect(c.pacotes).toBe(c.pacotes_total);
    expect(c.pacotes).toBeGreaterThanOrEqual(3);
    expect(c.funil).toBeGreaterThan(400);
    expect(c.tarefas).toBeGreaterThanOrEqual(2);
    expect(Date.now() - new Date(c.primeiro as Date).getTime()).toBeLessThan(61 * 86_400_000);
    // Números e caixa leem pelas mesmas funções da tela
    const [n] = await sql.begin(async (tx) => {
      await assumirUsuario(tx, usuarioDemo);
      return tx`select public.numeros(current_date - 30, current_date) as n`;
    });
    expect(n!.n).toBeTruthy();
  });

  it('a recriação diária apaga a anterior e monta tudo de novo', async () => {
    const r = await recriarDemo(deps);
    expect(r.empresaId).not.toBe(primeira);
    const [antiga] =
      await sql`select count(*)::int as n from public.empresas where id = ${primeira}`;
    expect(antiga!.n).toBe(0);
    const [demos] = await sql`select count(*)::int as n from public.empresas where eh_demo`;
    expect(demos!.n).toBe(1);
    const c = await contagens(r.empresaId);
    expect(c.leads).toBeGreaterThanOrEqual(50);
    expect(c.pre).toBe(1);
    primeira = r.empresaId;
  });

  it('nenhuma escrita do visitante passa (tabelas e funções, inclusive as livres)', async () => {
    const [lead] = await sql`select id from public.leads where empresa_id = ${primeira}
      and status = 'em_andamento' limit 1`;
    const [pacote] =
      await sql`select id from public.pacotes where empresa_id = ${primeira} limit 1`;
    const [aviso] = await sql`select id from public.avisos where empresa_id = ${primeira} limit 1`;
    const tentativas: [string, (tx: postgres.TransactionSql) => Promise<unknown>][] = [
      ['update empresa', (tx) => tx`update public.empresas set nome = 'X' where id = ${primeira}`],
      ['update pacote', (tx) => tx`update public.pacotes set nome = 'X' where id = ${pacote!.id}`],
      ['delete faixa', (tx) => tx`delete from public.faixas_idade where empresa_id = ${primeira}`],
      [
        'insert auditoria',
        (tx) => tx`insert into public.auditoria (empresa_id, usuario_id, acao, entidade)
        values (${primeira}, ${usuarioDemo}, 'x', 'x')`,
      ],
      ['nota', (tx) => tx`select public.adicionar_nota(${lead!.id}, 'oi')`],
      ['contato', (tx) => tx`select public.registrar_contato(${lead!.id}, 'whatsapp', null)`],
      ['marcar perdido', (tx) => tx`select public.marcar_perdido(${lead!.id}, 'preco', null)`],
      ['avisos lidos', (tx) => tx`select public.marcar_avisos_lidos(${[aviso!.id]}::uuid[])`],
      [
        'preferências',
        (tx) => tx`select public.salvar_preferencias_avisos('{}'::jsonb, '22:00', '07:00', true)`,
      ],
      ['push', (tx) => tx`select public.inscrever_push('https://push.example/x', 'p', 'a', 'ua')`],
      ['suporte', (tx) => tx`select public.permitir_suporte()`],
      ['aceite', (tx) => tx`select public.registrar_aceite('2099-01-01')`],
      ['exportação', (tx) => tx`select public.lgpd_registrar_exportacao()`],
      ['exclusão', (tx) => tx`select public.solicitar_exclusao_conta()`],
      ['apagar lead', (tx) => tx`select public.lgpd_apagar_lead(${lead!.id})`],
      ['página', (tx) => tx`select public.salvar_perguntas('[]'::jsonb)`],
    ];
    for (const [nome, t] of tentativas) {
      expect(await comoVisitante(t), nome).toMatch(/DEMO_SOMENTE_LEITURA/);
    }
  });

  it('o visitante não envia arquivo para o Storage', async () => {
    const [st] = await sql`select to_regclass('storage.objects') is not null as tem`;
    if (!st!.tem) return; // banco sem Storage (shim do CI sem Docker)
    const erro = await comoVisitante(
      (tx) => tx`insert into storage.objects (bucket_id, name)
        values ('midia', ${primeira + '/logo/' + randomUUID() + '.webp'})`,
    );
    expect(erro).toMatch(/row-level security/);
  });

  it('toda tabela com empresa_id tem a trava da demo', async () => {
    const sem = await sql`select c.table_name as t from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'empresa_id' and tb.table_type = 'BASE TABLE'
        and not exists (select 1 from pg_trigger g
          where g.tgrelid = format('public.%I', c.table_name)::regclass and not g.tgisinternal
            and g.tgfoid in ('public._exigir_escrita()'::regprocedure, 'public._exigir_nao_demo()'::regprocedure))`;
    expect(sem.map((r) => r.t)).toEqual([]);
  });

  it('link público da demo: lead e orçamento sempre de teste; métricas reais intactas', async () => {
    const [antes] =
      await sql`select coalesce(sum(total), 0)::int as n from public.landing_contagem`;
    // um lead criado fora da montagem (como faria o link público) nasce como teste
    const [l] = await sql`insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status)
      values (${primeira}, 'Cliente Real?', '+5534999990000', 'link_direto', 'novo')
      returning eh_teste`;
    expect(l!.eh_teste).toBe(true);
    const [depois] =
      await sql`select coalesce(sum(total), 0)::int as n from public.landing_contagem`;
    expect(depois!.n).toBe(antes!.n);

    const { listarEmpresasInternas } = await import('@/server/interno/carregar');
    const lista = await listarEmpresasInternas();
    expect(lista.some((e) => e.slug === SLUG)).toBe(false);
  });

  it('a demo nunca manda e-mail e nunca toma o slug de uma empresa real', async () => {
    await sql`select public._aviso_criar(${primeira}, ${usuarioDemo}, 'conta_suspensa', null,
      '{}'::jsonb, ${'demo-email:' + primeira}, false)`;
    const [e] = await sql`select count(*)::int as n from public.avisos_entregas
      where empresa_id = ${primeira} and canal = 'email'`;
    expect(e!.n).toBe(0);

    const [real] = await sql`select slug from public.empresas where not eh_demo limit 1`;
    await expect(recriarDemo({ ...deps, slug: real!.slug as string })).rejects.toThrow();
    const [ainda] =
      await sql`select count(*)::int as n from public.empresas where id = ${primeira}`;
    expect(ainda!.n).toBe(1);
  });
});

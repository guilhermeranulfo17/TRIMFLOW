import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { criarProxyIdas, type ProxyIdas } from '../support/proxy-idas';
import { IDS, urlBancoTeste } from '../support/db';

/*
 * Orçamento de idas ao banco por tela (Etapa 9.5, A.0/A.3). Roda os mesmos loaders que cada
 * tela do painel chama, através de um proxy que conta round trips reais. Sem cache do Next.
 * As telas medem só o que é delas (o layout é medido à parte).
 */

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));

let proxy: ProxyIdas;
const resultados: Record<string, number> = {};

beforeAll(async () => {
  proxy = await criarProxyIdas(urlBancoTeste());
  process.env.DATABASE_URL = proxy.url;
  // aquece o pool (as conexões abertas não contam)
  const { obterDb } = await import('@/server/db/client');
  const { sql } = await import('drizzle-orm');
  await Promise.all(Array.from({ length: 5 }, () => obterDb().execute(sql`select pg_sleep(0.05)`)));
});

afterAll(async () => {
  console.info('[idas ao banco]', JSON.stringify(resultados));
  await proxy.fechar();
});

async function medir(nome: string, fn: () => Promise<unknown>): Promise<number> {
  proxy.zerar();
  await fn();
  resultados[nome] = proxy.idas();
  return resultados[nome]!;
}

async function usuarioDono() {
  const { lerUsuario } = await import('@/server/auth/sessao');
  const u = await lerUsuario(IDS.donoA);
  return { ...u!, suporte: null };
}

/** Orçamento (A.3): o teste falha se uma tela passar do limite. */
const LIMITE: Record<string, number> = {
  layout: 2,
  leads: 3,
  agenda: 3,
  numeros: 3,
  lead: 4,
  empresa: 3,
  // Etapa 9.6: a landing lê os preços numa ida (anon, sem identidade de usuário)
  landing: 2,
  // Etapa 9B: Minha empresa → Privacidade e dados (retenção e exclusão agendada numa leitura)
  privacidade: 2,
  // Etapa 10: prévia do contrato (orçamento vigente; itens, reserva e modelo juntos)
  contrato_novo: 4,
  // Etapa 10 PR 2: lista (contratos + contagem), detalhe (contrato, assinaturas, histórico e
  // ligados em pipeline) e modelos
  contratos: 2,
  contrato: 3,
  contrato_modelos: 2,
  // Etapa 11: Financeiro (reservas, parcelas e recebimentos em pipeline) e a festa
  financeiro: 3,
  financeiro_festa: 3,
};

describe('idas ao banco por tela', () => {
  it('layout do painel (identidade + contexto)', async () => {
    const { lerUsuario } = await import('@/server/auth/sessao');
    const { carregarContextoPainel } = await import('@/server/painel/contexto');
    const n = await medir('layout', async () => {
      const u = { ...(await lerUsuario(IDS.donoA))!, suporte: null };
      await carregarContextoPainel(u);
    });
    expect(n).toBeLessThanOrEqual(LIMITE.layout!);
  });

  it('leads', async () => {
    const u = await usuarioDono();
    const { listarCaixa, resumoHoje, usuariosDaEmpresa } = await import('@/server/leads/carregar');
    const { carregarChecklist } = await import('@/server/onboarding/carregar');
    const { comUsuario } = await import('@/server/db/tenant');
    const { filtrosDaUrl } = await import('@/domain/leads/filtros');
    const n = await medir('leads', () =>
      comUsuario(u.id, (tx) =>
        Promise.all([
          resumoHoje(u, tx),
          listarCaixa(u, filtrosDaUrl({}), null, 30, tx),
          usuariosDaEmpresa(u, tx),
          carregarChecklist(u, tx),
        ]),
      ),
    );
    expect(n).toBeLessThanOrEqual(LIMITE.leads!);
  });

  it('agenda', async () => {
    const u = await usuarioDono();
    const { carregarTelaAgenda } = await import('@/server/agenda/carregar');
    const { hojeNoFuso, somarDias } = await import('@/domain/dates');
    const hoje = hojeNoFuso(u.empresa.fuso);
    const mes = `${hoje.slice(0, 7)}-01`;
    const n = await medir('agenda', () =>
      carregarTelaAgenda(
        u,
        { de: mes, ate: somarDias(mes, 30) },
        { de: hoje, ate: somarDias(hoje, 59) },
      ),
    );
    expect(n).toBeLessThanOrEqual(LIMITE.agenda!);
  });

  it('números', async () => {
    const u = await usuarioDono();
    const { carregarTelaNumeros } = await import('@/server/numeros/carregar');
    const { hojeNoFuso, somarDias } = await import('@/domain/dates');
    const hoje = hojeNoFuso(u.empresa.fuso);
    const n = await medir('numeros', () => carregarTelaNumeros(u, somarDias(hoje, -29), hoje));
    expect(n).toBeLessThanOrEqual(LIMITE.numeros!);
  });

  it('detalhe do lead', async () => {
    const u = await usuarioDono();
    const { carregarLead } = await import('@/server/leads/carregar');
    const { obterDb } = await import('@/server/db/client');
    const { sql } = await import('drizzle-orm');
    const [l] = await obterDb().execute<{ id: string }>(
      sql`select id from public.leads where empresa_id = ${IDS.empresaA} and not eh_teste order by criado_em limit 1`,
    );
    const n = await medir('lead', () => carregarLead(u, l!.id));
    expect(n).toBeLessThanOrEqual(LIMITE.lead!);
  });

  it('minha empresa', async () => {
    const u = await usuarioDono();
    const { comUsuario } = await import('@/server/db/tenant');
    const { empresas } = await import('@/server/db/schema');
    const { eq } = await import('drizzle-orm');
    // pendências vêm do contexto do painel (já contado no layout)
    const n = await medir('empresa', () =>
      comUsuario(u.id, (tx) => tx.select().from(empresas).where(eq(empresas.id, u.empresa.id))),
    );
    expect(n).toBeLessThanOrEqual(LIMITE.empresa!);
  });

  it('privacidade e dados (LGPD)', async () => {
    const u = await usuarioDono();
    const { carregarPrivacidade } = await import('@/server/lgpd/carregar');
    const n = await medir('privacidade', () => carregarPrivacidade(u));
    expect(n).toBeLessThanOrEqual(LIMITE.privacidade!);
  });

  it('gerar contrato (prévia a partir do orçamento aceito)', async () => {
    const u = await usuarioDono();
    const { prepararContrato } = await import('@/server/contratos/emitir');
    const { comUsuario } = await import('@/server/db/tenant');
    const { obterDb } = await import('@/server/db/client');
    const { sql } = await import('drizzle-orm');
    const [o] = await obterDb().execute<{ id: string }>(
      sql`select id from public.orcamentos where empresa_id = ${IDS.empresaA}
        and status = 'aceito' limit 1`,
    );
    const n = await medir('contrato_novo', () =>
      comUsuario(u.id, (tx) => prepararContrato(u, { orcamentoId: o!.id, preencher: {} }, tx)),
    );
    expect(n).toBeLessThanOrEqual(LIMITE.contrato_novo!);
  });

  it('contratos: lista, detalhe e modelos', async () => {
    const u = await usuarioDono();
    const { carregarListaContratos, carregarDetalheContrato, carregarModelos } =
      await import('@/server/contratos/painel');
    const { obterDb } = await import('@/server/db/client');
    const { sql } = await import('drizzle-orm');
    const [c] = await obterDb().execute<{ id: string }>(
      sql`select id from public.contratos where empresa_id = ${IDS.empresaA} limit 1`,
    );
    expect(await medir('contratos', () => carregarListaContratos(u, 'todos'))).toBeLessThanOrEqual(
      LIMITE.contratos!,
    );
    expect(
      await medir('contrato', () =>
        carregarDetalheContrato(u, c?.id ?? '00000000-0000-4000-8000-000000000000'),
      ),
    ).toBeLessThanOrEqual(LIMITE.contrato!);
    expect(await medir('contrato_modelos', () => carregarModelos(u))).toBeLessThanOrEqual(
      LIMITE.contrato_modelos!,
    );
  });

  it('financeiro: tela e festa', async () => {
    const u = await usuarioDono();
    const { carregarFinanceiro, carregarFinanceiroDaFesta } =
      await import('@/server/financeiro/carregar');
    const { obterDb } = await import('@/server/db/client');
    const { sql } = await import('drizzle-orm');
    const [r] = await obterDb().execute<{ id: string }>(
      sql`select id from public.reservas where empresa_id = ${IDS.empresaA}
        and tipo = 'confirmada' and status = 'ativa' limit 1`,
    );
    expect(await medir('financeiro', () => carregarFinanceiro(u, 'abertos'))).toBeLessThanOrEqual(
      LIMITE.financeiro!,
    );
    expect(
      await medir('financeiro_festa', () => carregarFinanceiroDaFesta(u, r!.id)),
    ).toBeLessThanOrEqual(LIMITE.financeiro_festa!);
  });

  it('landing (preços da vitrine)', async () => {
    const { carregarPrecosVitrine } = await import('@/server/marketing/carregar');
    const n = await medir('landing', () => carregarPrecosVitrine());
    expect(n).toBeLessThanOrEqual(LIMITE.landing!);
  });
});

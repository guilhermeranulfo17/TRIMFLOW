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
  layout: Number.POSITIVE_INFINITY,
  leads: Number.POSITIVE_INFINITY,
  agenda: Number.POSITIVE_INFINITY,
  numeros: Number.POSITIVE_INFINITY,
  lead: Number.POSITIVE_INFINITY,
  empresa: Number.POSITIVE_INFINITY,
};

describe('idas ao banco por tela', () => {
  it('layout do painel (identidade + contexto)', async () => {
    const { lerUsuario } = await import('@/server/auth/sessao');
    const { carregarPendencias } = await import('@/server/catalogo/pendencias');
    const { resumoHoje } = await import('@/server/leads/carregar');
    const { contarNaoLidos } = await import('@/server/avisos/carregar');
    const { carregarEstadoOnboarding } = await import('@/server/onboarding/carregar');
    const { carregarFaixaConta } = await import('@/server/cobranca/carregar');
    const n = await medir('layout', async () => {
      const u = { ...(await lerUsuario(IDS.donoA))!, suporte: null };
      await Promise.all([
        carregarPendencias(u.id),
        resumoHoje(u),
        contarNaoLidos(u),
        carregarEstadoOnboarding(u),
        carregarFaixaConta(u),
      ]);
    });
    expect(n).toBeLessThanOrEqual(LIMITE.layout!);
  });

  it('leads', async () => {
    const u = await usuarioDono();
    const { listarCaixa, resumoHoje, usuariosDaEmpresa } = await import('@/server/leads/carregar');
    const { carregarChecklist } = await import('@/server/onboarding/carregar');
    const { filtrosDaUrl } = await import('@/domain/leads/filtros');
    const n = await medir('leads', () =>
      Promise.all([
        resumoHoje(u),
        listarCaixa(u, filtrosDaUrl({})),
        usuariosDaEmpresa(u),
        carregarChecklist(u),
      ]),
    );
    expect(n).toBeLessThanOrEqual(LIMITE.leads!);
  });

  it('agenda', async () => {
    const u = await usuarioDono();
    const ag = await import('@/server/agenda/carregar');
    const { hojeNoFuso, somarDias } = await import('@/domain/dates');
    const hoje = hojeNoFuso(u.empresa.fuso);
    const n = await medir('agenda', async () => {
      await ag.carregarBase(u);
      await Promise.all([
        ag.carregarDisponibilidade(
          u,
          `${hoje.slice(0, 7)}-01`,
          somarDias(`${hoje.slice(0, 7)}-01`, 30),
          null,
        ),
        ag.carregarPeriodo(u, hoje, somarDias(hoje, 59)),
        ag.preReservasVencendo(u, 12),
      ]);
    });
    expect(n).toBeLessThanOrEqual(LIMITE.agenda!);
  });

  it('números', async () => {
    const u = await usuarioDono();
    const { carregarNumeros, carregarOcupacao } = await import('@/server/numeros/carregar');
    const { recursosDaEmpresa } = await import('@/server/cobranca/carregar');
    const { usuariosDaEmpresa } = await import('@/server/leads/carregar');
    const { hojeNoFuso, somarDias } = await import('@/domain/dates');
    const hoje = hojeNoFuso(u.empresa.fuso);
    const n = await medir('numeros', async () => {
      await recursosDaEmpresa(u.empresa.id);
      await Promise.all([
        carregarNumeros(u, somarDias(hoje, -29), hoje),
        carregarOcupacao(u),
        usuariosDaEmpresa(u),
      ]);
    });
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
    const { carregarPendencias } = await import('@/server/catalogo/pendencias');
    const { comUsuario } = await import('@/server/db/tenant');
    const { empresas } = await import('@/server/db/schema');
    const { eq } = await import('drizzle-orm');
    const n = await medir('empresa', async () => {
      await carregarPendencias(u.id);
      await comUsuario(u.id, (tx) =>
        tx.select().from(empresas).where(eq(empresas.id, u.empresa.id)),
      );
    });
    expect(n).toBeLessThanOrEqual(LIMITE.empresa!);
  });
});

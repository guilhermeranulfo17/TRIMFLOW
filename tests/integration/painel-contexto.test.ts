import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { conectar, IDS, urlBancoTeste } from '../support/db';
import {
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';

/*
 * Etapa 9.5 (A.3): public.painel_contexto() + montarContextoPainel devolvem exatamente o que os
 * loaders antigos do layout devolviam, nos mesmos dados do seed (dono e vendedor do Buffet Demo,
 * dono do Buffet Teste B) e numa conta inadimplente (assinatura de referência e suspensão).
 */

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));

process.env.DATABASE_URL = urlBancoTeste();
const sql = conectar();
let inadimplente: EmpresaTemporaria;

beforeAll(async () => {
  inadimplente = await criarEmpresaTemporaria(sql, 'eventos');
  await sql`insert into public.assinaturas
      (empresa_id, plano_codigo, ciclo, valor_centavos, status, pago_ate, atrasada_desde, criada_em,
       cancelada_em)
    values
      (${inadimplente.empresaId}, 'profissional', 'mensal', 24700, 'ativa',
       current_date - 5, current_date - 4, now() - interval '40 days', null),
      (${inadimplente.empresaId}, 'essencial', 'mensal', 14700, 'cancelada',
       current_date - 60, null, now() - interval '90 days', now() - interval '60 days')`;
  await sql`update public.empresas set plano = 'inadimplente' where id = ${inadimplente.empresaId}`;
});

afterAll(async () => {
  await sql`delete from public.assinaturas where empresa_id = ${inadimplente.empresaId}`;
  await removerEmpresa(sql, inadimplente);
  await sql.end();
});

async function comparar(usuarioId: string) {
  const { lerUsuario } = await import('@/server/auth/sessao');
  const { carregarContextoPainel } = await import('@/server/painel/contexto');
  const { carregarPendencias } = await import('@/server/catalogo/pendencias');
  const { resumoHoje } = await import('@/server/leads/carregar');
  const { contarNaoLidos } = await import('@/server/avisos/carregar');
  const { carregarEstadoOnboarding } = await import('@/server/onboarding/carregar');
  const { carregarFaixaConta, recursosDaEmpresa } = await import('@/server/cobranca/carregar');

  const u = { ...(await lerUsuario(usuarioId))!, suporte: null };
  const [ctx, pendencias, resumo, naoLidos, onboarding, conta, recursos] = await Promise.all([
    carregarContextoPainel(u),
    carregarPendencias(u.id),
    resumoHoje(u),
    contarNaoLidos(u),
    carregarEstadoOnboarding(u),
    carregarFaixaConta(u),
    recursosDaEmpresa(u.empresa.id),
  ]);
  expect(ctx.pendencias).toEqual(pendencias);
  expect(ctx.resumo).toEqual(resumo);
  expect(ctx.naoLidos).toBe(naoLidos);
  expect(ctx.onboarding).toEqual(onboarding);
  expect(ctx.conta).toEqual(conta);
  expect(ctx.recursos).toEqual(recursos);
  return ctx;
}

describe('painel_contexto = loaders antigos', () => {
  it('dono do Buffet Demo (catálogo, avisos, plano ativo)', async () => {
    const ctx = await comparar(IDS.donoA);
    expect(ctx.naoLidos).toBeGreaterThan(0);
    expect(ctx.conta?.situacao).toBe('ativo');
  });

  it('vendedor do Buffet Demo (sem faixa da conta)', async () => {
    const ctx = await comparar(IDS.vendedorA);
    expect(ctx.conta).toBeNull();
  });

  it('dono do Buffet Teste B (onboarding parado, catálogo vazio, pendências)', async () => {
    const ctx = await comparar(IDS.donoB);
    expect(ctx.pendencias.length).toBeGreaterThan(0);
    expect(ctx.onboarding.concluido).toBe(false);
  });

  it('dono inadimplente (assinatura de referência e suspensão prevista)', async () => {
    const ctx = await comparar(inadimplente.donoId);
    expect(ctx.conta?.situacao).toBe('inadimplente');
    expect(ctx.conta?.suspendeEm).not.toBeNull();
    expect(ctx.conta?.pagoAte).not.toBeNull();
  });

  it('não vaza dados entre empresas', async () => {
    const { lerUsuario } = await import('@/server/auth/sessao');
    const { carregarContextoPainel } = await import('@/server/painel/contexto');
    const b = { ...(await lerUsuario(IDS.donoB))!, suporte: null };
    const ctx = await carregarContextoPainel(b);
    const [pacotes] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.pacotes where empresa_id = ${IDS.empresaB}`;
    expect(ctx.onboarding.catalogoVazio).toBe(pacotes!.n === 0);
    expect(ctx.naoLidos).toBe(
      (
        await sql<{ n: number }[]>`select count(*)::int as n from public.avisos
          where usuario_id = ${IDS.donoB} and lido_em is null`
      )[0]!.n,
    );
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { MODELOS } from '@/domain/modelos';
import type { ContextoPreco } from '@/domain/preco';
import { montarPrevia, montarVitrine, somenteAtivos } from '@/domain/publico';
import { carregarContexto } from '@/server/catalogo/carregar';
import { gravarModelo } from '@/server/catalogo/gravar-modelo';
import { criarComAnon } from '@/server/db/anon';
import { criarDb } from '@/server/db/client';
import { criarComUsuario } from '@/server/db/tenant';
import { lerBuffet, lerContextoPublico, lerSlugAtual } from '@/server/publico/carregar';
import { conectar, IDS, urlBancoTeste } from '../support/db';
import { criarEmpresaTemporaria, removerEmpresa } from '../support/empresa-temporaria';

const sql = conectar();
const { db, sql: sqlDrizzle } = criarDb(urlBancoTeste(), { max: 4 });
const comUsuario = criarComUsuario(db);
const comAnon = criarComAnon(db);
afterAll(async () => {
  await sql.end();
  await sqlDrizzle.end();
});

/** Ordena listas cuja ordem o banco não garante (vínculos, ajustes, empates de ordenação). */
function normalizar(c: ContextoPreco) {
  const porJson = <T>(l: T[]) =>
    [...l].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    ...c,
    ajustesDia: porJson(c.ajustesDia),
    faixasIdade: porJson(c.faixasIdade),
    pacotes: c.pacotes.map((p) => ({ ...p, tiposEventoIds: [...p.tiposEventoIds].sort() })),
    opcionais: c.opcionais.map((o) => ({
      ...o,
      pacotesCompativeisIds: [...o.pacotesCompativeisIds].sort(),
      pacotesInclusoIds: [...o.pacotesInclusoIds].sort(),
      tiposEventoIds: [...o.tiposEventoIds].sort(),
    })),
  };
}

describe('contexto do link público', () => {
  it('é o mesmo contexto do painel (só itens ativos) no Buffet Demo', async () => {
    const publico = await lerContextoPublico('buffet-demo', comAnon);
    const painel = await carregarContexto(IDS.donoA, comUsuario);
    expect(publico).not.toBeNull();
    expect(normalizar(publico!.ctx)).toEqual(normalizar(somenteAtivos(painel!)));
    expect(publico!.fuso).toBe('America/Sao_Paulo');
    expect(publico!.prazoPreReservaHoras).toBeGreaterThan(0);
  });

  it('o mesmo com itens inativos: ficam fora do contexto público', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    try {
      expect((await gravarModelo(comUsuario, e.donoId, e.empresaId, MODELOS.infantil)).ok).toBe(
        true,
      );
      await sql`update public.pacotes set ativo = false
        where id = (select id from public.pacotes where empresa_id = ${e.empresaId} order by ordem limit 1)`;
      await sql`update public.opcionais set ativo = false
        where id = (select id from public.opcionais where empresa_id = ${e.empresaId} order by ordem limit 1)`;
      const [{ slug }] =
        (await sql`select slug from public.empresas where id = ${e.empresaId}`) as [
          { slug: string },
        ];
      const publico = await lerContextoPublico(slug, comAnon);
      const painel = await carregarContexto(e.donoId, comUsuario);
      expect(publico!.ctx.pacotes.length).toBe(painel!.pacotes.length - 1);
      expect(normalizar(publico!.ctx)).toEqual(normalizar(somenteAtivos(painel!)));
    } finally {
      await removerEmpresa(sql, e);
    }
  });

  it('slug inexistente ou suspenso: sem contexto', async () => {
    expect(await lerContextoPublico('nao-existe-abc', comAnon)).toBeNull();
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    try {
      await sql`update public.empresas set plano = 'suspenso' where id = ${e.empresaId}`;
      const [{ slug }] =
        (await sql`select slug from public.empresas where id = ${e.empresaId}`) as [
          { slug: string },
        ];
      expect(await lerContextoPublico(slug, comAnon)).toBeNull();
      expect(await lerBuffet(slug, comAnon)).toMatchObject({ suspenso: true });
    } finally {
      await removerEmpresa(sql, e);
    }
  });

  it('buffet devolve a identidade sem e-mail nem plano; slug antigo redireciona', async () => {
    const b = await lerBuffet('buffet-demo', comAnon);
    expect(b).toMatchObject({ nome: 'Buffet Demo', slug: 'buffet-demo', suspenso: false });
    expect(Object.keys(b!)).not.toContain('email');
    expect(await lerBuffet('nao-existe-abc', comAnon)).toBeNull();
    expect(await lerSlugAtual('nao-existe-abc', comAnon)).toBeNull();
  });
});

describe('modo de exibição de preço (nada vaza para o navegador)', () => {
  it('faixa e após contato: a vitrine não leva preço por pacote nem tabelas', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    try {
      await gravarModelo(comUsuario, e.donoId, e.empresaId, MODELOS.infantil);
      const [{ slug }] =
        (await sql`select slug from public.empresas where id = ${e.empresaId}`) as [
          { slug: string },
        ];
      for (const modo of ['faixa', 'apos_contato'] as const) {
        await sql`update public.regras_comerciais set modo_exibicao_preco = ${modo}
          where empresa_id = ${e.empresaId}`;
        const contexto = await lerContextoPublico(slug, comAnon);
        const vitrine = montarVitrine(contexto!.ctx, contexto!.extras, '2026-09-30');
        const json = JSON.stringify(vitrine);
        expect(json).not.toMatch(
          /precoPessoaCentavos|valorExcedenteCentavos|faixasPreco|fatorBp|ajusteBp|precoCentavos/,
        );
        expect(vitrine.pacotes.every((p) => p.aPartirDeCentavos === null)).toBe(true);
        if (modo === 'apos_contato') expect(vitrine.aPartirDeCentavos).toBeNull();
        else expect(vitrine.aPartirDeCentavos).toBeGreaterThan(0);

        // Prévia antes do WhatsApp (o que calcularPrevia devolve sem token).
        const tipo = contexto!.ctx.tiposEvento[0]!.id;
        const previa = montarPrevia(
          contexto!.ctx,
          { tipoEventoId: tipo, criancas: [], opcionais: [], horasExtras: 0, adultos: 50 },
          { hoje: '2026-09-30', comContato: false, modo },
        );
        expect(previa.totalCentavos).toBeNull();
        expect(previa.pacotes).toEqual([]);
        if (modo === 'apos_contato') expect(previa.aPartirDeCentavos).toBeNull();
      }
    } finally {
      await removerEmpresa(sql, e);
    }
  });
});

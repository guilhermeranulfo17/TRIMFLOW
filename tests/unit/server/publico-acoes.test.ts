import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Server actions do link público, sem banco: honeypot, tempo mínimo e validação barram ANTES
 * de qualquer consulta (nenhum lead é criado). O banco e o Next são substituídos por dublês.
 */
const comAnon = vi.fn();
const cookiesSet = vi.fn();
vi.mock('@/server/db/anon', () => ({ comAnon: (...a: unknown[]) => comAnon(...a) }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }),
  cookies: async () => ({ get: () => undefined, set: cookiesSet, delete: vi.fn() }),
}));
vi.mock('@/server/publico/carregar', () => ({ carregarContextoPublico: vi.fn(async () => null) }));
vi.mock('@/server/publico/sessao', () => ({
  cookieDoOrcamento: (s: string) => `orc_${s}`,
  OPCOES_COOKIE: () => ({}),
  lerTokenDoCookie: async () => null,
  ehModoTeste: async () => false,
}));

const { iniciarOrcamento, preReservar, verDisponibilidade, calcularPrevia } =
  await import('@/server/actions/publico');
const { assinarInstante, hashIp, tempoDesde } = await import('@/server/publico/seguranca');

const escolhas = { criancas: [], opcionais: [], horasExtras: 0 };
const contatoOk = { nome: 'Maria', whatsapp: '34991355450', aceite: true as const };

beforeEach(() => {
  comAnon.mockReset();
  cookiesSet.mockReset();
});

describe('iniciarOrcamento: barreiras antes do banco', () => {
  it('honeypot preenchido: recusa sem criar lead', async () => {
    const r = await iniciarOrcamento('buffet-demo', {
      contato: { ...contatoOk, site: 'http://spam', inicio: assinarInstante(Date.now() - 10_000) },
      escolhas,
    });
    expect(r.ok).toBe(false);
    expect(comAnon).not.toHaveBeenCalled();
  });

  it('enviado rápido demais ou com instante forjado: recusa sem criar lead', async () => {
    for (const inicio of [assinarInstante(Date.now() - 500), '1700000000000.forjado', undefined]) {
      const r = await iniciarOrcamento('buffet-demo', {
        contato: { ...contatoOk, inicio },
        escolhas,
      });
      expect(r.ok).toBe(false);
    }
    expect(comAnon).not.toHaveBeenCalled();
  });

  it('sem aceite ou WhatsApp que não é celular: erro no campo', async () => {
    const semAceite = await iniciarOrcamento('buffet-demo', {
      contato: { ...contatoOk, aceite: false as unknown as true },
      escolhas,
    });
    expect(semAceite).toMatchObject({ ok: false, campos: { aceite: expect.any(String) } });
    const fixo = await iniciarOrcamento('buffet-demo', {
      contato: {
        ...contatoOk,
        whatsapp: '3432101234',
        inicio: assinarInstante(Date.now() - 10_000),
      },
      escolhas,
    });
    expect(fixo).toMatchObject({ ok: false, campos: { whatsapp: expect.any(String) } });
    expect(comAnon).not.toHaveBeenCalled();
  });

  it('slug inválido ou escolhas malformadas: recusa', async () => {
    expect((await iniciarOrcamento('../x', { contato: contatoOk, escolhas })).ok).toBe(false);
    expect(
      (
        await iniciarOrcamento('buffet-demo', {
          contato: contatoOk,
          escolhas: { adultos: -1 } as never,
        })
      ).ok,
    ).toBe(false);
    expect(comAnon).not.toHaveBeenCalled();
  });
});

describe('outras actions validam a entrada antes do banco', () => {
  it('token, mês e passo inválidos', async () => {
    expect((await preReservar('buffet-demo', 'curto')).ok).toBe(false);
    expect((await verDisponibilidade('buffet-demo', '2026-13')).ok).toBe(false);
    expect((await calcularPrevia('buffet-demo', escolhas, 9)).ok).toBe(false);
    expect(comAnon).not.toHaveBeenCalled();
  });
});

describe('segurança', () => {
  it('hash do IP com sal (o IP não aparece) e instante assinado', () => {
    const h = hashIp('203.0.113.9');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('203');
    expect(hashIp('203.0.113.9')).toBe(h);
    expect(hashIp('203.0.113.10')).not.toBe(h);
    const agora = 1_800_000_000_000;
    expect(tempoDesde(assinarInstante(agora - 3000), agora)).toBe(3000);
    expect(tempoDesde(`${agora}.xxx`, agora)).toBeNull();
    expect(tempoDesde('abc', agora)).toBeNull();
    expect(tempoDesde(undefined, agora)).toBeNull();
  });
});

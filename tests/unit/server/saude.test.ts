import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/db/client', () => ({ obterDb: vi.fn() }));
vi.mock('@/server/marketing/carregar', () => ({ lerPrecosVitrine: vi.fn() }));
vi.mock('@/server/cobranca/config', () => ({ configAsaas: vi.fn() }));

const { verificarSaude } = await import('@/server/saude/verificar');

const AGORA = new Date('2026-10-04T12:00:00Z');
const base = {
  lerBanco: async () => ({
    fila_atraso_min: 0,
    jobs: [
      {
        nome: 'orkestra-processar-avisos',
        agenda: '* * * * *',
        ativo: true,
        ultima: '2026-10-04T11:59:30Z',
        ultimo_status: 'succeeded',
      },
    ],
  }),
  lerPlanos: async () => ({ planos: [{ codigo: 'essencial' }] }),
  asaasConfigurado: () => true,
  agora: () => AGORA,
};

describe('/api/saude (verificarSaude)', () => {
  it('tudo certo: ok', async () => {
    expect((await verificarSaude(base)).ok).toBe(true);
  });

  it('fila de avisos atrasada: 503 com o item', async () => {
    const s = await verificarSaude({
      ...base,
      lerBanco: async () => ({ ...(await base.lerBanco()), fila_atraso_min: 25 }),
    });
    expect(s.ok).toBe(false);
    expect(s.itens.filter((i) => !i.ok)).toEqual([
      { item: 'fila_avisos', ok: false, detalhe: 'atrasada 25 min' },
    ]);
  });

  it('leitura de planos_vitrine falhou (simulado): 503', async () => {
    const s = await verificarSaude({
      ...base,
      lerPlanos: async () => {
        throw new Error('function publico.planos_vitrine() does not exist');
      },
    });
    expect(s.itens.filter((i) => !i.ok).map((i) => i.item)).toEqual(['planos_vitrine']);
  });

  it('banco fora: só o item banco (sem detalhe técnico na resposta)', async () => {
    const s = await verificarSaude({
      ...base,
      lerBanco: async () => {
        throw new Error('ECONNREFUSED 10.0.0.1:5432 senha=x');
      },
    });
    expect(s.ok).toBe(false);
    expect(JSON.stringify(s)).not.toContain('ECONNREFUSED');
    expect(s.itens.find((i) => i.item === 'banco')).toEqual({ item: 'banco', ok: false });
  });
});

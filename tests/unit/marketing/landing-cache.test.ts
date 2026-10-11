import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * B.0 (Etapa 9B): a falha de leitura dos preços nunca fica guardada.
 * - o cache de dados (unstable_cache) só guarda sucesso: aqui um cache falso com a mesma regra;
 * - a página não entra no cache estático: noStore() é chamado só na falha.
 */

const execute = vi.fn();
const noStore = vi.fn();
const guardados = new Map<string, unknown>();

vi.mock('@/server/db/anon', () => ({
  comAnon: (fn: (tx: { execute: typeof execute }) => unknown) => fn({ execute }),
}));
vi.mock('next/cache', () => ({
  unstable_noStore: () => noStore(),
  unstable_cache: (fn: () => Promise<unknown>, chave: string[]) => async () => {
    const k = chave.join(':');
    if (guardados.has(k)) return guardados.get(k);
    const v = await fn(); // exceção sobe sem guardar nada, como no Next
    guardados.set(k, v);
    return v;
  },
}));

const PLANOS = {
  planos: [{ codigo: 'essencial', nome: 'Essencial', preco_mensal_centavos: 9900 }],
};

describe('carregarPrecosVitrine', () => {
  beforeEach(() => {
    execute.mockReset();
    noStore.mockReset();
    guardados.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('falha de leitura: devolve null, tira a página do cache e não guarda a falha', async () => {
    const { carregarPrecosVitrine } = await import('@/server/marketing/carregar');
    execute.mockRejectedValueOnce(Object.assign(new Error('x'), { code: '42883' }));

    expect(await carregarPrecosVitrine()).toBeNull();
    expect(noStore).toHaveBeenCalledTimes(1);
    expect(guardados.size).toBe(0);

    // A próxima requisição lê de novo e agora encontra os preços
    execute.mockResolvedValueOnce([{ v: PLANOS }]);
    const p = await carregarPrecosVitrine();
    expect(p?.planos).toHaveLength(1);
    expect(p?.planos[0]?.precoMensalCentavos).toBe(9900);
    expect(noStore).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('sucesso: a página continua estática (sem noStore) e o resultado fica no cache', async () => {
    const { carregarPrecosVitrine } = await import('@/server/marketing/carregar');
    execute.mockResolvedValue([{ v: PLANOS }]);

    await carregarPrecosVitrine();
    await carregarPrecosVitrine();
    expect(noStore).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

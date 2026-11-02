import { describe, expect, it } from 'vitest';
import {
  CODIGOS_MODULO,
  MODULOS,
  podeVender,
  prontoParaVenda,
  regraDeCobranca,
  resumoCompra,
} from '@/domain/modulos';

describe('catálogo', () => {
  it('cada solução tem três entregas e textos preenchidos', () => {
    for (const c of CODIGOS_MODULO) {
      const m = MODULOS[c];
      expect(m.entregas).toHaveLength(3);
      for (const t of [m.nome, m.beneficio, m.explicacao, m.problema])
        expect(t.length).toBeGreaterThan(3);
    }
  });

  it('só módulo implementado e sem pendência técnica pode ser vendido, e só com a venda liberada', () => {
    for (const c of CODIGOS_MODULO) {
      expect(prontoParaVenda(c)).toBe(
        MODULOS[c].implementado && MODULOS[c].pendenciasTecnicas.length === 0,
      );
      expect(podeVender(c, false)).toBe(false);
    }
    expect(podeVender('orkmargem', true)).toBe(true);
    expect(podeVender('orkflow', true)).toBe(false);
  });

  it('nenhum texto promete o que o produto não faz', () => {
    const tudo = JSON.stringify(MODULOS).toLowerCase();
    expect(tudo).not.toMatch(/ilimitad|mais vendid|garantid|lucro líquido garantido/);
  });
});

describe('resumo da compra', () => {
  const margem = {
    nome: 'OrkMargem',
    cobranca: 'mensal' as const,
    precoCentavos: 14900,
    carenciaDias: 0,
    acessoEventoDias: null,
  };

  it('mensal: cobrado agora, recorrência, próxima data e regras', () => {
    const r = resumoCompra(margem, { hoje: '2026-11-02' });
    expect(r).toMatchObject({
      agoraCentavos: 14900,
      recorrenteCentavos: 14900,
      primeiroVencimento: '2026-11-02',
      proximaCobranca: '2026-12-02',
    });
    expect(r.linhas.map((l) => l.rotulo)).toEqual([
      'Cobrado agora',
      'Depois',
      'Acesso',
      'Proporcional',
      'Cancelamento',
      'Atraso',
      'Assinatura do sistema',
    ]);
    expect(regraDeCobranca(margem)).toMatch(/por mês/);
  });

  it('por evento: só a festa escolhida, acesso pela política do módulo', () => {
    const pass = {
      ...margem,
      nome: 'OrkPass',
      cobranca: 'por_evento' as const,
      precoCentavos: 2900,
    };
    expect(
      resumoCompra(pass, { hoje: '2026-11-02', dataFesta: '2026-12-05' }).acessoAte,
    ).toBeNull();
    const r = resumoCompra(
      { ...pass, acessoEventoDias: 7 },
      { hoje: '2026-11-02', dataFesta: '2026-12-05' },
    );
    expect(r).toMatchObject({ recorrenteCentavos: null, acessoAte: '2026-12-12' });
  });
});

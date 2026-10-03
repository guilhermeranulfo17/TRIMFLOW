import { describe, expect, it } from 'vitest';
import { faixaFundador, type CupomFundador, type PlanoVitrine } from '@/domain/marketing';

const profissional: PlanoVitrine = {
  codigo: 'profissional',
  nome: 'Profissional',
  precoMensalCentavos: 24700,
  precoAnualCentavos: 247000,
  maxUsuarios: 5,
  maxEspacos: null,
  whatsappAvisos: true,
  followUp: true,
  numerosCompleto: true,
};
const cupom: CupomFundador = {
  planoCodigo: 'profissional',
  ciclo: 'mensal',
  descontoCentavos: 15000,
  duracaoMeses: 12,
  maxUsos: 10,
  usos: 3,
  validoAte: null,
  ativo: true,
};
const agora = new Date('2026-10-03T12:00:00Z');

describe('faixaFundador', () => {
  it('ativo com vagas: restam X de 10, valor e meses do cupom', () => {
    expect(faixaFundador(cupom, [profissional], agora)).toEqual({
      planoNome: 'Profissional',
      vagas: 7,
      totalVagas: 10,
      valorCentavos: 9700,
      ciclo: 'mensal',
      meses: 12,
    });
  });

  it('some esgotado, inativo, expirado, sem cupom ou sem o plano', () => {
    expect(faixaFundador({ ...cupom, usos: 10 }, [profissional], agora)).toBeNull();
    expect(faixaFundador({ ...cupom, ativo: false }, [profissional], agora)).toBeNull();
    expect(
      faixaFundador(
        { ...cupom, validoAte: new Date('2026-10-01T00:00:00Z') },
        [profissional],
        agora,
      ),
    ).toBeNull();
    expect(faixaFundador(null, [profissional], agora)).toBeNull();
    expect(faixaFundador(cupom, [], agora)).toBeNull();
    expect(faixaFundador({ ...cupom, descontoCentavos: 24700 }, [profissional], agora)).toBeNull();
  });

  it('dentro da validade e sem limite de usos continua', () => {
    const f = faixaFundador(
      { ...cupom, maxUsos: null, validoAte: new Date('2026-12-31T00:00:00Z') },
      [profissional],
      agora,
    );
    expect(f).toMatchObject({ vagas: null, totalVagas: null, valorCentavos: 9700 });
  });
});

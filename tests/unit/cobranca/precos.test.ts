import { describe, expect, it } from 'vitest';
import {
  fimDoCupom,
  mesesGratisNoAnual,
  normalizarCodigoCupom,
  pagoAteDaCobranca,
  precoDoCiclo,
  primeiroVencimento,
  validarCupom,
  valorDaAssinatura,
  type Cupom,
} from '@/domain/cobranca/precos';

const pro = {
  codigo: 'profissional',
  nome: 'Profissional',
  precoMensalCentavos: 24700,
  precoAnualCentavos: 247000,
};
const ess = { ...pro, codigo: 'essencial', precoMensalCentavos: 14700, precoAnualCentavos: 147000 };
const fundador: Cupom = {
  codigo: 'FUNDADOR',
  planoCodigo: 'profissional',
  ciclo: 'mensal',
  descontoCentavos: 15000,
  duracaoMeses: 12,
  maxUsos: 10,
  usos: 0,
  validoAte: null,
  ativo: true,
};
const agora = new Date('2026-11-10T12:00:00Z');

describe('preços', () => {
  it('anual = 2 meses grátis nos dois planos', () => {
    expect(mesesGratisNoAnual(pro)).toBe(2);
    expect(mesesGratisNoAnual(ess)).toBe(2);
    expect(mesesGratisNoAnual({ ...ess, precoAnualCentavos: 14700 * 12 })).toBe(0);
    expect(precoDoCiclo(pro, 'anual')).toBe(247000);
  });

  it('cupom de fundador: R$ 97/mês por 12 meses', () => {
    expect(valorDaAssinatura(pro, 'mensal', fundador)).toBe(9700);
    expect(valorDaAssinatura(pro, 'mensal', null)).toBe(24700);
    expect(valorDaAssinatura(ess, 'mensal', { ...fundador, descontoCentavos: 99999 })).toBe(0);
    expect(fimDoCupom('2026-11-10', 12)).toBe('2027-11-09');
  });

  it('validação do cupom', () => {
    const v = (c: Cupom | null, o: Partial<Parameters<typeof validarCupom>[1]> = {}) =>
      validarCupom(c, { plano: 'profissional', ciclo: 'mensal', agora, jaUsou: false, ...o });
    expect(v(fundador).ok).toBe(true);
    expect(v(null)).toEqual({ ok: false, erro: 'Cupom não encontrado.' });
    expect(v({ ...fundador, ativo: false }).ok).toBe(false);
    expect(v({ ...fundador, usos: 10 })).toMatchObject({ erro: expect.stringContaining('vagas') });
    expect(v({ ...fundador, validoAte: new Date('2026-11-01') })).toMatchObject({
      erro: 'Este cupom expirou.',
    });
    expect(v(fundador, { jaUsou: true })).toMatchObject({
      erro: expect.stringContaining('já usou'),
    });
    expect(v(fundador, { ciclo: 'anual' })).toMatchObject({
      erro: 'Este cupom vale só para o plano Profissional mensal.',
    });
    expect(v(fundador, { plano: 'essencial' }).ok).toBe(false);
    expect(normalizarCodigoCupom(' fundador! ')).toBe('FUNDADOR');
  });

  it('período coberto e 1º vencimento', () => {
    expect(pagoAteDaCobranca('2026-01-31', 'mensal')).toBe('2026-02-27');
    expect(pagoAteDaCobranca('2026-11-10', 'mensal')).toBe('2026-12-09');
    expect(pagoAteDaCobranca('2026-11-10', 'anual')).toBe('2027-11-09');
    expect(primeiroVencimento('2026-11-10', '2026-11-15')).toBe('2026-11-15');
    expect(primeiroVencimento('2026-11-10', '2026-11-01')).toBe('2026-11-10');
    expect(primeiroVencimento('2026-11-10', null)).toBe('2026-11-10');
  });
});

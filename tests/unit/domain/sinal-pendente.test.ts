import { describe, expect, it } from 'vitest';
import { sinalPendente, type EntradaSinal } from '@/domain/financeiro/sinal';

const base: EntradaSinal = {
  tipo: 'confirmada',
  status: 'ativa',
  sinalCentavos: 0,
  recebidoCentavos: 0,
  temPlano: false,
  data: '2026-12-20',
  hoje: '2026-11-17',
};

describe('sinal pendente (§99)', () => {
  it('confirmada, ativa, sem sinal, sem recebimento e sem plano: pendente', () => {
    expect(sinalPendente(base)).toBe(true);
    expect(sinalPendente({ ...base, sinalCentavos: null })).toBe(true);
    expect(sinalPendente({ ...base, data: '2026-11-17' })).toBe(true);
  });

  it('com sinal, recebimento ou plano: não', () => {
    expect(sinalPendente({ ...base, sinalCentavos: 100 })).toBe(false);
    expect(sinalPendente({ ...base, recebidoCentavos: 5_000 })).toBe(false);
    expect(sinalPendente({ ...base, temPlano: true })).toBe(false);
  });

  it('pré-reserva, cancelada, realizada ou festa que já passou: não', () => {
    expect(sinalPendente({ ...base, tipo: 'pre_reserva' })).toBe(false);
    expect(sinalPendente({ ...base, status: 'cancelada' })).toBe(false);
    expect(sinalPendente({ ...base, status: 'realizada' })).toBe(false);
    expect(sinalPendente({ ...base, data: '2026-11-16' })).toBe(false);
  });
});

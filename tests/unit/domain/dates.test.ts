import { describe, expect, it } from 'vitest';
import { diaDaSemana, formatData, formatDataHora, FUSO_PADRAO, hojeNoFuso } from '@/domain/dates';

describe('hojeNoFuso', () => {
  it('perto da meia-noite em São Paulo: 23:30 local ainda é o dia anterior (02:30 UTC)', () => {
    const agora = new Date('2026-11-15T02:30:00Z'); // 14/11 23:30 em SP (UTC-3)
    expect(hojeNoFuso(FUSO_PADRAO, agora)).toBe('2026-11-14');
  });

  it('00:30 local já é o dia seguinte (03:30 UTC)', () => {
    const agora = new Date('2026-11-15T03:30:00Z'); // 15/11 00:30 em SP
    expect(hojeNoFuso(FUSO_PADRAO, agora)).toBe('2026-11-15');
  });

  it('em UTC o mesmo instante pode ser outro dia', () => {
    const agora = new Date('2026-11-15T02:30:00Z');
    expect(hojeNoFuso('UTC', agora)).toBe('2026-11-15');
  });

  it('usa São Paulo por padrão', () => {
    expect(hojeNoFuso(undefined, new Date('2026-01-01T02:59:59Z'))).toBe('2025-12-31');
    expect(hojeNoFuso(undefined, new Date('2026-01-01T03:00:00Z'))).toBe('2026-01-01');
  });
});

describe('formatData', () => {
  it('data civil não sofre conversão de fuso', () => {
    expect(formatData('2026-11-14')).toBe('14/11/2026');
    expect(formatData('2026-01-01', 'Pacific/Kiritimati')).toBe('01/01/2026');
  });

  it('instante é exibido no fuso da empresa', () => {
    expect(formatData(new Date('2026-11-15T02:30:00Z'))).toBe('14/11/2026');
    expect(formatData('2026-11-15T02:30:00Z')).toBe('14/11/2026');
    expect(formatData('2026-11-15T03:30:00Z')).toBe('15/11/2026');
    expect(formatData('2026-11-15T02:30:00Z', 'UTC')).toBe('15/11/2026');
  });

  it('rejeita datas inválidas', () => {
    expect(() => formatData('não é data')).toThrow(RangeError);
    expect(() => formatData('2026-02-30')).toThrow(RangeError);
  });
});

describe('formatDataHora', () => {
  it('formata no fuso da empresa', () => {
    expect(formatDataHora('2026-11-14T21:30:00Z')).toBe('14/11/2026 18:30');
  });
});

describe('diaDaSemana', () => {
  it('data civil', () => {
    expect(diaDaSemana('2026-11-14')).toBe('sábado');
    expect(diaDaSemana('2026-11-16')).toBe('segunda-feira');
    expect(diaDaSemana('2026-11-15')).toBe('domingo');
  });

  it('instante perto da meia-noite usa o fuso', () => {
    // 15/11 02:30 UTC = sábado 14/11 23:30 em SP; domingo em UTC
    expect(diaDaSemana(new Date('2026-11-15T02:30:00Z'))).toBe('sábado');
    expect(diaDaSemana(new Date('2026-11-15T02:30:00Z'), 'UTC')).toBe('domingo');
  });
});

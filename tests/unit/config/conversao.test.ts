import { describe, expect, it } from 'vitest';
import {
  alternarDia,
  bpParaTexto,
  centavosParaTexto,
  formatarDuracao,
  hmParaMinutos,
  minutosParaHm,
  normalizarHora,
  resumirDias,
  textoParaBp,
  textoParaCentavos,
} from '@/domain/conversao';
import { bpParaPercentualTexto } from '@/domain/percent';

describe('dinheiro', () => {
  it.each([
    ['4.500,00', 450000],
    ['4500', 450000],
    ['85', 8500],
    ['0,5', 50],
    ['R$ 1.234,56', 123456],
  ])('"%s" → %i centavos', (texto, esperado) => {
    expect(textoParaCentavos(texto)).toBe(esperado);
  });

  it.each(['', '  ', 'abc', '-10', '1,234.00'])('"%s" → null', (texto) => {
    expect(textoParaCentavos(texto)).toBeNull();
  });

  it('centavos → texto sem R$', () => {
    expect(centavosParaTexto(450000)).toBe('4.500,00');
    expect(centavosParaTexto(0)).toBe('0,00');
    expect(centavosParaTexto(Number.NaN)).toBe('');
    expect(centavosParaTexto(null)).toBe('');
    expect(centavosParaTexto(undefined)).toBe('');
  });
});

describe('percentual', () => {
  it.each([
    ['10', {}, 1000],
    ['12,5', {}, 1250],
    ['12.5', {}, 1250],
    ['0,25', {}, 25],
    ['10%', {}, 1000],
    ['-15', { permitirNegativo: true }, -1500],
    ['-0', { permitirNegativo: true }, 0],
    ['100', {}, 10000],
  ])('"%s" %o → %i bp', (texto, opcoes, esperado) => {
    expect(textoParaBp(texto, opcoes)).toBe(esperado);
  });

  it.each(['', 'dez', '1,234', '-15'])('"%s" → null (sem negativo)', (texto) => {
    expect(textoParaBp(texto)).toBeNull();
  });

  it('bp → texto', () => {
    expect(bpParaTexto(1000)).toBe('10');
    expect(bpParaTexto(-1500)).toBe('-15');
    expect(bpParaTexto(1250)).toBe('12,5');
    expect(bpParaTexto(5)).toBe('0,05');
    expect(bpParaTexto(null)).toBe('');
  });

  it('ida e volta', () => {
    for (const bp of [0, 5, 1000, 1250, -1500, 10000]) {
      expect(textoParaBp(bpParaTexto(bp), { permitirNegativo: true })).toBe(bp);
    }
  });

  it('bp → numeric do Postgres', () => {
    expect(bpParaPercentualTexto(550)).toBe('5.50');
    expect(bpParaPercentualTexto(0)).toBe('0.00');
    expect(bpParaPercentualTexto(10000)).toBe('100.00');
    expect(() => bpParaPercentualTexto(-1)).toThrow(RangeError);
  });
});

describe('duração', () => {
  it('minutos ↔ horas e minutos', () => {
    expect(minutosParaHm(270)).toEqual({ horas: 4, minutos: 30 });
    expect(hmParaMinutos(4, 30)).toBe(270);
    expect(hmParaMinutos(-1, 10)).toBe(10);
  });

  it.each([
    [240, '4h'],
    [270, '4h30'],
    [45, '45min'],
    [305, '5h05'],
  ])('%i min → %s', (min, texto) => {
    expect(formatarDuracao(min)).toBe(texto);
  });

  it('hora', () => {
    expect(normalizarHora('15:00:00')).toBe('15:00');
    expect(normalizarHora('09:30')).toBe('09:30');
    expect(normalizarHora('24:00')).toBeNull();
    expect(normalizarHora('9h')).toBeNull();
  });
});

describe('dias da semana', () => {
  it('alterna mantendo ordem e sem repetição', () => {
    expect(alternarDia([6], 5)).toEqual([5, 6]);
    expect(alternarDia([1, 5, 6], 5)).toEqual([1, 6]);
    expect(alternarDia([], 0)).toEqual([0]);
  });

  it.each([
    [[0, 1, 2, 3, 4, 5, 6], 'Todos os dias'],
    [[6], 'Sáb'],
    [[1, 2, 3, 4], 'Seg a Qui'],
    [[0, 6], 'Dom, Sáb'],
    [[4, 5, 6, 0], 'Dom, Qui, Sex, Sáb'],
    [[], 'Nenhum dia'],
  ])('%j → %s', (dias, texto) => {
    expect(resumirDias(dias)).toBe(texto);
  });
});

import { describe, expect, it } from 'vitest';
import { formatBRL, parseBRL, pct, tentarParseBRL } from '@/domain/money';

describe('formatBRL', () => {
  it.each([
    [703237, 'R$ 7.032,37'],
    [0, 'R$ 0,00'],
    [1, 'R$ 0,01'],
    [10, 'R$ 0,10'],
    [100, 'R$ 1,00'],
    [99999, 'R$ 999,99'],
    [100000, 'R$ 1.000,00'],
    [123456789, 'R$ 1.234.567,89'],
    [-37013, '-R$ 370,13'],
  ])('%i → %s', (cents, esperado) => {
    expect(formatBRL(cents)).toBe(esperado);
  });

  it('usa espaço comum entre R$ e o número', () => {
    expect(formatBRL(100)).toBe('R$ 1,00');
    expect(formatBRL(100)).not.toContain(' ');
  });

  it('recusa float', () => {
    expect(() => formatBRL(10.5)).toThrow(TypeError);
    expect(() => formatBRL(Number.NaN)).toThrow(TypeError);
  });
});

describe('parseBRL', () => {
  it.each([
    ['7.032,37', 703237],
    ['R$ 7.032,37', 703237],
    ['R$ 7.032,37', 703237],
    ['7032,37', 703237],
    ['7032', 703200],
    ['7.032', 703200],
    ['0,5', 50],
    ['0,05', 5],
    ['1.234.567,89', 123456789],
    ['-370,13', -37013],
    ['0', 0],
    ['-0,00', 0],
  ])('"%s" → %i', (entrada, esperado) => {
    expect(parseBRL(entrada)).toBe(esperado);
  });

  it.each(['', 'abc', '7,032.37', '1.23', '12,345', '1..000', '1.0000,00', ',50'])(
    'rejeita "%s"',
    (entrada) => {
      expect(() => parseBRL(entrada)).toThrow();
      expect(tentarParseBRL(entrada)).toBeNull();
    },
  );

  it('ida e volta com formatBRL', () => {
    for (const cents of [0, 1, 99, 100, 703237, 123456789]) {
      expect(parseBRL(formatBRL(cents))).toBe(cents);
    }
  });
});

describe('pct (meio para cima)', () => {
  it('exemplo da proposta: 5% de R$ 7.402,50 = R$ 370,13', () => {
    expect(pct(740250, 5)).toBe(37013);
  });

  it('exemplo da proposta: 30% de R$ 7.032,37 = R$ 2.109,71', () => {
    expect(pct(703237, 30)).toBe(210971);
  });

  it('exemplo da proposta: 10% de R$ 5.775,00 = R$ 577,50', () => {
    expect(pct(577500, 10)).toBe(57750);
  });

  it('arredonda exatamente .5 para cima', () => {
    expect(pct(1, 50)).toBe(1); // 0,5 → 1
    expect(pct(3, 50)).toBe(2); // 1,5 → 2
    expect(pct(5, 10)).toBe(1); // 0,5 → 1
  });

  it('arredonda abaixo de .5 para baixo', () => {
    expect(pct(1, 49)).toBe(0); // 0,49
    expect(pct(4, 10)).toBe(0); // 0,4
  });

  it('aceita percentual fracionado sem erro de float', () => {
    expect(pct(10000, 12.5)).toBe(1250);
    expect(pct(10000, 0.1)).toBe(10);
    expect(pct(333, 33.3333)).toBe(111); // 110,99988… → 111
  });

  it('negativos arredondam afastando do zero (simétrico)', () => {
    expect(pct(-1, 50)).toBe(-1);
    expect(pct(-740250, 5)).toBe(-37013);
  });

  it('zero e 100%', () => {
    expect(pct(0, 30)).toBe(0);
    expect(pct(703237, 0)).toBe(0);
    expect(pct(703237, 100)).toBe(703237);
  });

  it('não perde precisão em valores grandes', () => {
    expect(pct(9_000_000_000_000, 33)).toBe(2_970_000_000_000);
  });

  it('recusa centavos não inteiros', () => {
    expect(() => pct(10.5, 10)).toThrow(TypeError);
    expect(() => pct(100, Number.NaN)).toThrow(TypeError);
  });
});

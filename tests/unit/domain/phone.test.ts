import { describe, expect, it } from 'vitest';
import { celularBRParaE164, ehCelularBR, formatPhoneBR, toE164 } from '@/domain/phone';

describe('toE164', () => {
  it.each([
    ['(34) 99135-5450', '+5534991355450'],
    ['34991355450', '+5534991355450'],
    ['034991355450', '+5534991355450'],
    ['+55 34 99135-5450', '+5534991355450'],
    ['55 34 99135 5450', '+5534991355450'],
    ['(34) 3213-5450', '+553432135450'],
    ['(11) 98765-4321', '+5511987654321'],
  ])('"%s" → %s', (entrada, esperado) => {
    expect(toE164(entrada, 'BR')).toBe(esperado);
  });

  it.each(['', 'abc', '123', '(20) 99135-5450', '(34) 9135-545', '99135-5450'])(
    'retorna null para "%s"',
    (entrada) => {
      expect(toE164(entrada, 'BR')).toBeNull();
    },
  );
});

describe('formatPhoneBR', () => {
  it('celular', () => {
    expect(formatPhoneBR('+5534991355450')).toBe('(34) 99135-5450');
  });

  it('fixo', () => {
    expect(formatPhoneBR('+553432135450')).toBe('(34) 3213-5450');
  });

  it('número estrangeiro no formato internacional', () => {
    expect(formatPhoneBR('+14155552671')).toBe('+1 415 555 2671');
  });
});

describe('celular brasileiro', () => {
  it('reconhece celular', () => {
    expect(ehCelularBR('(34) 99135-5450')).toBe(true);
    expect(ehCelularBR('+5511987654321')).toBe(true);
  });

  it('rejeita fixo', () => {
    expect(ehCelularBR('(34) 3213-5450')).toBe(false);
    expect(ehCelularBR('(11) 3333-4444')).toBe(false);
  });

  it('rejeita DDD inexistente e números incompletos', () => {
    expect(ehCelularBR('(20) 99135-5450')).toBe(false);
    expect(ehCelularBR('(34) 99135-545')).toBe(false);
  });

  it('rejeita número estrangeiro', () => {
    expect(ehCelularBR('+14155552671')).toBe(false);
  });

  it('celularBRParaE164 normaliza ou retorna null', () => {
    expect(celularBRParaE164('(34) 99135-5450')).toBe('+5534991355450');
    expect(celularBRParaE164('(34) 3213-5450')).toBeNull();
  });
});

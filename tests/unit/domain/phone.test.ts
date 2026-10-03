import { describe, expect, it } from 'vitest';
import { parsePhoneNumberFromString as parseMax } from 'libphonenumber-js/max';
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

describe('equivalência com os metadados "max" (regra do Brasil explícita)', () => {
  // amostra de todos os DDDs de 10 a 99 × prefixos de assinante × tamanhos
  const entradas: string[] = [];
  for (let ddd = 10; ddd <= 99; ddd++) {
    for (const assinante of [
      '991355450',
      '81234567',
      '71234567',
      '61234567',
      '21234567',
      '31234567',
      '41234567',
      '51234567',
      '91234567',
      '11234567',
      '01234567',
      '9913554501',
      '9135545',
      '891355450',
    ]) {
      entradas.push(`(${ddd}) ${assinante}`, `+55${ddd}${assinante}`);
    }
  }

  for (const n of [
    '0800 123 4567',
    '0800 123 456',
    '0300 123 4567',
    '0500 123 4567',
    '0900 123 4567',
    '3003-1234',
    '4004-1234',
    '4020-1234',
    '3003 123 456',
  ])
    entradas.push(n);

  it('toE164 e ehCelularBR dão o mesmo resultado que o "max" em números brasileiros', () => {
    const diferentes = entradas.filter((e) => {
      const n = parseMax(e, 'BR');
      const e164Max = n?.isValid() ? n.number : null;
      const celularMax =
        !!n?.isValid() &&
        n.country === 'BR' &&
        (n.getType() === 'MOBILE' || n.getType() === 'FIXED_LINE_OR_MOBILE');
      return toE164(e, 'BR') !== e164Max || ehCelularBR(e) !== celularMax;
    });
    expect(diferentes).toEqual([]);
  });
});

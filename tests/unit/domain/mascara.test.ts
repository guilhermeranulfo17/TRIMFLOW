import { describe, expect, it } from 'vitest';
import { mascaraTelefoneBR } from '@/domain/mascara';

describe('mascaraTelefoneBR', () => {
  it.each([
    ['', ''],
    ['3', '(3'],
    ['34', '(34'],
    ['349', '(34) 9'],
    ['3499135', '(34) 9913-5'],
    ['3432135450', '(34) 3213-5450'],
    ['34991355450', '(34) 99135-5450'],
    ['349913554501234', '(34) 99135-5450'],
    ['(34) 99135-5450', '(34) 99135-5450'],
    ['+55 34 99135-5450', '(34) 99135-5450'],
    ['abc', ''],
  ])('"%s" → "%s"', (entrada, esperado) => {
    expect(mascaraTelefoneBR(entrada)).toBe(esperado);
  });
});

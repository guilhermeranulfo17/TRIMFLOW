import { describe, expect, it } from 'vitest';
import {
  cnpjValido,
  cpfValido,
  formatarDocumento,
  mascararDocumento,
  tipoDocumento,
} from '@/domain/cobranca/documento';

describe('CPF e CNPJ', () => {
  it('valida dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-26')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('123')).toBe(false);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
  });

  it('identifica o tipo, formata e mascara', () => {
    expect(tipoDocumento('52998224725')).toBe('cpf');
    expect(tipoDocumento('11222333000181')).toBe('cnpj');
    expect(tipoDocumento('11222333000180')).toBeNull();
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25');
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('12')).toBe('12');
    expect(mascararDocumento('52998224725')).toBe('529•••••25');
    expect(mascararDocumento('12')).toBe('•••');
  });
});

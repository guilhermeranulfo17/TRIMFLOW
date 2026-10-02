/*
 * CPF e CNPJ do pagador (dados de cobrança). Sempre gravados só com dígitos.
 */

export type TipoDocumento = 'cpf' | 'cnpj';

export const limparDocumento = (v: string): string => v.replace(/\D/g, '');

const repetido = (d: string) => /^(\d)\1+$/.test(d);

function digitoMod11(base: string, pesos: number[]): number {
  const soma = base.split('').reduce((s, c, i) => s + Number(c) * pesos[i]!, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const d = limparDocumento(valor);
  if (d.length !== 11 || repetido(d)) return false;
  const d1 = digitoMod11(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoMod11(d.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[9]) && d2 === Number(d[10]);
}

export function cnpjValido(valor: string): boolean {
  const d = limparDocumento(valor);
  if (d.length !== 14 || repetido(d)) return false;
  const d1 = digitoMod11(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoMod11(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

export function tipoDocumento(valor: string): TipoDocumento | null {
  const d = limparDocumento(valor);
  if (d.length === 11) return cpfValido(d) ? 'cpf' : null;
  if (d.length === 14) return cnpjValido(d) ? 'cnpj' : null;
  return null;
}

export const documentoValido = (valor: string): boolean => tipoDocumento(valor) !== null;

/** "123.456.789-09" ou "12.345.678/0001-95"; inválido volta como veio. */
export function formatarDocumento(valor: string): string {
  const d = limparDocumento(valor);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return valor;
}

/** Só os 3 primeiros e os 2 últimos dígitos (telas do /interno). */
export function mascararDocumento(valor: string): string {
  const d = limparDocumento(valor);
  if (d.length < 6) return '•••';
  return `${d.slice(0, 3)}•••••${d.slice(-2)}`;
}

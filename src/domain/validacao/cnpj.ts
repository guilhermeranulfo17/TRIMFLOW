/** CNPJ: só dígitos no banco (14), máscara na tela e dígitos verificadores conferidos aqui. */

export function limparCnpj(entrada: string): string {
  return entrada.replace(/\D/g, '').slice(0, 14);
}

function digito(base: string): number {
  const pesos =
    base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = base.split('').reduce((n, d, i) => n + Number(d) * pesos[i]!, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(entrada: string): boolean {
  const c = limparCnpj(entrada);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const d1 = digito(c.slice(0, 12));
  const d2 = digito(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

/** "12345678000195" → "12.345.678/0001-95" (aplica durante a digitação). */
export function mascaraCnpj(entrada: string): string {
  const c = limparCnpj(entrada);
  const partes = [c.slice(0, 2), c.slice(2, 5), c.slice(5, 8), c.slice(8, 12), c.slice(12, 14)];
  let r = partes[0]!;
  if (partes[1]) r += `.${partes[1]}`;
  if (partes[2]) r += `.${partes[2]}`;
  if (partes[3]) r += `/${partes[3]}`;
  if (partes[4]) r += `-${partes[4]}`;
  return r;
}

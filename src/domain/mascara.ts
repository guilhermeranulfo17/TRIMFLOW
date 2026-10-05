/**
 * Máscara de telefone BR aplicada durante a digitação.
 * "3499135" → "(34) 9913-5"; "34991355450" → "(34) 99135-5450"; "3432135450" → "(34) 3213-5450".
 */
export function mascaraTelefoneBR(entrada: string): string {
  let digitos = entrada.replace(/\D/g, '');
  if (digitos.startsWith('55') && digitos.length > 11) digitos = digitos.slice(2);
  digitos = digitos.slice(0, 11);
  if (digitos.length === 0) return '';
  if (digitos.length <= 2) return `(${digitos}`;
  const ddd = digitos.slice(0, 2);
  const resto = digitos.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Máscara de CPF durante a digitação: "52998224725" → "529.982.247-25". */
export function mascaraCpf(entrada: string): string {
  const d = entrada.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

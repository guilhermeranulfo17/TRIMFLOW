import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

/** Telefone é sempre salvo em E.164 ("+5534991355450"). */
export type E164 = string;

/** Converte entrada livre em E.164. Retorna null se o número não for válido. */
export function toE164(input: string, pais: CountryCode = 'BR'): E164 | null {
  const numero = parsePhoneNumberFromString(input, pais);
  if (!numero?.isValid()) return null;
  return numero.number;
}

/** "+5534991355450" → "(34) 99135-5450"; fixo "+553432135450" → "(34) 3213-5450". */
export function formatPhoneBR(e164: E164): string {
  const numero = parsePhoneNumberFromString(e164);
  if (!numero) return e164;
  if (numero.country !== 'BR') return numero.formatInternational();
  const nacional = numero.nationalNumber;
  const ddd = nacional.slice(0, 2);
  const resto = nacional.slice(2);
  const corte = resto.length - 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Verdadeiro para celular brasileiro válido (DDD existente + 9 dígitos começando com 9). */
export function ehCelularBR(input: string): boolean {
  const numero = parsePhoneNumberFromString(input, 'BR');
  if (!numero?.isValid() || numero.country !== 'BR') return false;
  const tipo = numero.getType();
  return tipo === 'MOBILE' || tipo === 'FIXED_LINE_OR_MOBILE';
}

/** Valida e normaliza um celular brasileiro (ex.: WhatsApp). Retorna E.164 ou null. */
export function celularBRParaE164(input: string): E164 | null {
  return ehCelularBR(input) ? toE164(input, 'BR') : null;
}

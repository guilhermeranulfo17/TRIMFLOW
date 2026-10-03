import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

/*
 * Metadados "min" da libphonenumber (bem menores que "max", que ia para o navegador em toda tela
 * com formulário). O "min" não sabe o tipo do número nem confere o DDD, então a regra do Brasil
 * fica explícita aqui, igual à do "max" (teste de equivalência em tests/unit/domain/phone):
 * DDD existente; celular = 9 dígitos começando com 9 (ou 8 começando com 7, legado);
 * fixo = 8 dígitos começando de 2 a 5; números de serviço (0800, 0300, 4004…) sem DDD.
 */

/** Telefone é sempre salvo em E.164 ("+5534991355450"). */
export type E164 = string;

/** DDDs existentes (Anatel). */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

type TipoBR = 'celular' | 'fixo' | 'servico';

/** 0800, 0300/0500/0900 e 3003/4004…: sem DDD (mesmos padrões dos metadados "max"). */
const SERVICO =
  /^(?:800\d{6,7}|[59]00\d{6,7}|(?:30[03]\d{3}|4(?:0(?:0\d|20)|370|864))\d{4}|300\d{5})$/;

/** Número nacional brasileiro (DDD + assinante) → tipo, ou null se inválido. */
function tipoBR(nacional: string): TipoBR | null {
  if (SERVICO.test(nacional)) return 'servico';
  if (!/^\d{10,11}$/.test(nacional) || !DDDS.has(Number(nacional.slice(0, 2)))) return null;
  const assinante = nacional.slice(2);
  if (/^9\d{8}$/.test(assinante) || /^7\d{7}$/.test(assinante)) return 'celular';
  if (/^[2-5]\d{7}$/.test(assinante)) return 'fixo';
  return null;
}

function analisar(input: string, pais?: CountryCode) {
  const numero = parsePhoneNumberFromString(input, pais);
  if (!numero) return null;
  if (numero.countryCallingCode === '55') {
    const tipo = tipoBR(numero.nationalNumber);
    return tipo ? { numero, tipo } : null;
  }
  return numero.isValid() ? { numero, tipo: null } : null;
}

/** Converte entrada livre em E.164. Retorna null se o número não for válido. */
export function toE164(input: string, pais: CountryCode = 'BR'): E164 | null {
  return analisar(input, pais)?.numero.number ?? null;
}

/** "+5534991355450" → "(34) 99135-5450"; fixo "+553432135450" → "(34) 3213-5450". */
export function formatPhoneBR(e164: E164): string {
  const numero = parsePhoneNumberFromString(e164);
  if (!numero) return e164;
  if (numero.countryCallingCode !== '55') return numero.formatInternational();
  const nacional = numero.nationalNumber;
  const ddd = nacional.slice(0, 2);
  const resto = nacional.slice(2);
  const corte = resto.length - 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Verdadeiro para celular brasileiro válido (DDD existente + 9 dígitos começando com 9). */
export function ehCelularBR(input: string): boolean {
  return analisar(input, 'BR')?.tipo === 'celular';
}

/** Valida e normaliza um celular brasileiro (ex.: WhatsApp). Retorna E.164 ou null. */
export function celularBRParaE164(input: string): E164 | null {
  return ehCelularBR(input) ? toE164(input, 'BR') : null;
}

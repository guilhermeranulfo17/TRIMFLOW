/**
 * Dinheiro no Orkestra é SEMPRE um inteiro de centavos.
 * Nada de float: toda conta aqui é feita com inteiros (BigInt quando há multiplicação).
 */

export type Centavos = number;

function assertCentavos(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`Valor em centavos inválido: ${cents}. Use inteiros.`);
  }
}

function agruparMilhar(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 703237 → "R$ 7.032,37"; -37013 → "-R$ 370,13". */
export function formatBRL(cents: Centavos): string {
  assertCentavos(cents);
  const negativo = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.trunc(abs / 100).toString();
  const centavos = (abs % 100).toString().padStart(2, '0');
  return `${negativo ? '-' : ''}R$ ${agruparMilhar(reais)},${centavos}`;
}

const REGEX_BRL = /^(-)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/**
 * "7.032,37" → 703237. Aceita "R$", espaços, sinal negativo, sem centavos ("7032") e uma casa ("0,5" → 50).
 * Lança erro para qualquer formato ambíguo (ex.: "7,032.37", "1.23").
 */
export function parseBRL(input: string): Centavos {
  const limpo = input.replace(/R\$/i, '').replace(/\s| /g, '');
  const m = REGEX_BRL.exec(limpo);
  if (!m) throw new Error(`Valor em reais inválido: "${input}"`);
  const [, sinal, inteiro = '0', decimal = ''] = m;
  const cents = Number(inteiro.replace(/\./g, '')) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error(`Valor em reais fora do limite: "${input}"`);
  return sinal && cents !== 0 ? -cents : cents;
}

/** Tentativa segura de parse, para formulários. */
export function tentarParseBRL(input: string): Centavos | null {
  try {
    return parseBRL(input);
  } catch {
    return null;
  }
}

const ESCALA_PCT = 10_000n; // até 4 casas decimais no percentual

/**
 * Percentual de um valor em centavos, arredondado meio para cima (metade se afasta do zero).
 * `percentual` em pontos percentuais: 5 = 5%, 12.5 = 12,5%.
 *
 * pct(740250, 5)  → 37013 (37012,5 arredonda para cima)
 * pct(703237, 30) → 210971
 */
export function pct(cents: Centavos, percentual: number): Centavos {
  assertCentavos(cents);
  if (!Number.isFinite(percentual)) throw new TypeError(`Percentual inválido: ${percentual}`);
  const pEscalado = Math.round(percentual * Number(ESCALA_PCT));
  const numerador = BigInt(cents) * BigInt(pEscalado);
  const divisor = 100n * ESCALA_PCT;
  const negativo = numerador < 0n;
  const abs = negativo ? -numerador : numerador;
  const arredondado = (abs * 2n + divisor) / (divisor * 2n);
  const resultado = Number(negativo ? -arredondado : arredondado);
  return resultado === 0 ? 0 : resultado;
}

/**
 * Aplica um percentual em basis points (1% = 100 bp) a um valor em centavos,
 * arredondando meio para cima (metade se afasta do zero). Só aritmética inteira.
 *
 * pctBp(577500, 1000) → 57750 (10%); pctBp(740250, 500) → 37013; pctBp(577500, -1500) → -86625
 */
export function pctBp(cents: Centavos, bp: number): Centavos {
  assertCentavos(cents);
  if (!Number.isSafeInteger(bp))
    throw new TypeError(`Basis points inválidos: ${bp}. Use inteiros.`);
  const numerador = BigInt(cents) * BigInt(bp);
  const divisor = 10_000n;
  const negativo = numerador < 0n;
  const abs = negativo ? -numerador : numerador;
  const arredondado = (abs * 2n + divisor) / (divisor * 2n);
  const resultado = Number(negativo ? -arredondado : arredondado);
  return resultado === 0 ? 0 : resultado;
}

/** Divisão inteira de centavos arredondada meio para cima (ex.: valor por convidado). */
export function dividirArredondando(cents: Centavos, divisor: number): Centavos {
  assertCentavos(cents);
  if (!Number.isSafeInteger(divisor) || divisor <= 0) {
    throw new RangeError(`Divisor inválido: ${divisor}`);
  }
  const negativo = cents < 0;
  const abs = BigInt(Math.abs(cents));
  const d = BigInt(divisor);
  const resultado = Number((abs * 2n + d) / (d * 2n));
  return negativo && resultado !== 0 ? -resultado : resultado;
}

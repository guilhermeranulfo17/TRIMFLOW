/**
 * Formata uma razão como percentual pt-BR.
 * formatPct(0.154) → "15,4%"; formatPct(0.15) → "15%"; formatPct(0.1545, 2) → "15,45%".
 * Arredondamento meio para cima (metade se afasta do zero); zeros à direita são omitidos.
 */
export function formatPct(razao: number, casas = 1): string {
  if (!Number.isFinite(razao)) throw new TypeError(`Razão inválida: ${razao}`);
  if (!Number.isInteger(casas) || casas < 0 || casas > 4) {
    throw new RangeError(`Casas decimais inválidas: ${casas}`);
  }
  const fator = 10 ** casas;
  const negativo = razao < 0;
  // toPrecision corrige ruído binário (0.154 * 1000 = 153.99999999999997).
  const escalado = Number((Math.abs(razao) * 100 * fator).toPrecision(12));
  const inteiro = Math.floor(escalado + 0.5);
  if (inteiro === 0) return '0%';

  const parteInteira = Math.trunc(inteiro / fator)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const parteDecimal =
    casas > 0 ? (inteiro % fator).toString().padStart(casas, '0').replace(/0+$/, '') : '';
  return `${negativo ? '-' : ''}${parteInteira}${parteDecimal ? `,${parteDecimal}` : ''}%`;
}

/**
 * Formata basis points (1% = 100 bp) como percentual pt-BR, só com inteiros.
 * formatBp(1000) → "10%"; formatBp(-1500) → "-15%"; formatBp(1250) → "12,5%"; formatBp(1234) → "12,34%".
 * Com `{ sinal: true }` positivos ganham "+": formatBp(1000, { sinal: true }) → "+10%".
 */
export function formatBp(bp: number, opcoes: { sinal?: boolean } = {}): string {
  if (!Number.isSafeInteger(bp)) throw new TypeError(`Basis points inválidos: ${bp}`);
  const abs = Math.abs(bp);
  const inteiro = Math.trunc(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimal = (abs % 100).toString().padStart(2, '0').replace(/0+$/, '');
  const sinal = bp < 0 ? '-' : opcoes.sinal && bp > 0 ? '+' : '';
  return `${sinal}${inteiro}${decimal ? `,${decimal}` : ''}%`;
}

/**
 * Converte um percentual em texto decimal (como o Postgres devolve `numeric`, ex.: "5.00",
 * "12.5", "100") em basis points inteiros, sem passar por float. "5.00" → 500.
 */
export function percentualTextoParaBp(texto: string): number {
  const m = /^(\d{1,3})(?:\.(\d{1,2})\d*)?$/.exec(texto.trim());
  if (!m) throw new RangeError(`Percentual inválido: ${texto}`);
  const [, inteiro = '0', decimal = ''] = m;
  return Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
}

/** Basis points → texto decimal para colunas `numeric` do Postgres. 550 → "5.50". */
export function bpParaPercentualTexto(bp: number): string {
  if (!Number.isSafeInteger(bp) || bp < 0) throw new RangeError(`Basis points inválidos: ${bp}`);
  return `${Math.trunc(bp / 100)}.${(bp % 100).toString().padStart(2, '0')}`;
}

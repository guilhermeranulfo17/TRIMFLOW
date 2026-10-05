import { formatBRL, type Centavos } from '../money';

/*
 * Números e valores por extenso, em português do Brasil, para o contrato
 * ("R$ 1.500,00 (mil e quinhentos reais)"). Só inteiros: dinheiro chega em centavos.
 */

const UNIDADES = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];
const DEZENAS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
];
const CENTENAS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
];

/** 0 a 999 por extenso ("cento e vinte e três"). */
function ate999(n: number): string {
  if (n < 20) return UNIDADES[n]!;
  if (n < 100) {
    const d = Math.trunc(n / 10);
    const u = n % 10;
    return u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]!;
  }
  if (n === 100) return 'cem';
  const c = Math.trunc(n / 100);
  const resto = n % 100;
  return resto ? `${CENTENAS[c]} e ${ate999(resto)}` : CENTENAS[c]!;
}

const ESCALAS: [singular: string, plural: string][] = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
];

/**
 * Inteiro não negativo por extenso: 1500 → "mil e quinhentos", 2_000_001 → "dois milhões e um".
 * Regra do "e" entre grupos: só antes de um grupo menor que 100 ou de centena redonda
 * ("mil e quinhentos", "mil quinhentos e cinquenta").
 */
export function numeroPorExtenso(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`Número inválido: ${n}`);
  if (n === 0) return 'zero';
  if (n >= 1e12) throw new RangeError(`Número grande demais: ${n}`);
  const grupos: number[] = [];
  for (let resto = n; resto > 0; resto = Math.trunc(resto / 1000)) grupos.push(resto % 1000);

  const partes: { texto: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]!;
    if (g === 0) continue;
    let texto: string;
    if (i === 0) texto = ate999(g);
    else if (i === 1) texto = g === 1 ? 'mil' : `${ate999(g)} mil`;
    else texto = `${ate999(g)} ${g === 1 ? ESCALAS[i]![0] : ESCALAS[i]![1]}`;
    partes.push({ texto, valor: g });
  }
  return partes.reduce(
    (texto, p, i) =>
      i === 0 ? p.texto : `${texto}${p.valor < 100 || p.valor % 100 === 0 ? ' e ' : ' '}${p.texto}`,
    '',
  );
}

/** "milhão"/"bilhão" redondo pede "de reais" (um milhão de reais). */
function precisaDe(reais: number): boolean {
  return reais >= 1_000_000 && reais % 1_000_000 === 0;
}

/**
 * Valor em centavos por extenso: 150000 → "mil e quinhentos reais";
 * 150050 → "mil e quinhentos reais e cinquenta centavos"; 1 → "um centavo".
 */
export function valorPorExtenso(centavos: Centavos): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0) {
    throw new RangeError(`Valor inválido: ${centavos}`);
  }
  const reais = Math.trunc(centavos / 100);
  const cent = centavos % 100;
  const parteReais =
    reais === 0
      ? ''
      : `${numeroPorExtenso(reais)}${precisaDe(reais) ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`;
  const parteCent =
    cent === 0 ? '' : `${numeroPorExtenso(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`;
  if (!parteReais && !parteCent) return 'zero real';
  if (!parteCent) return parteReais;
  if (!parteReais) return parteCent;
  return `${parteReais} e ${parteCent}`;
}

/** "R$ 1.500,00 (mil e quinhentos reais)" */
export function valorComExtenso(centavos: Centavos): string {
  return `${formatBRL(centavos)} (${valorPorExtenso(centavos)})`;
}

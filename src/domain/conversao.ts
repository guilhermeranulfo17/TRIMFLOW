import { formatBRL, tentarParseBRL } from './money';

/**
 * Conversões entre o que a pessoa digita e o que o sistema guarda.
 * Dinheiro → centavos; percentual → basis points; duração → minutos; dias → 0..6.
 */

/** "4.500,00" → 450000; vazio ou inválido → null. */
export function textoParaCentavos(texto: string): number | null {
  if (texto.trim() === '') return null;
  const c = tentarParseBRL(texto);
  return c !== null && c >= 0 ? c : null;
}

/** 450000 → "4.500,00" (sem o "R$"). */
export function centavosParaTexto(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '';
  return formatBRL(centavos).replace('R$ ', '');
}

const REGEX_PCT = /^(-)?(\d{1,5})(?:[,.](\d{1,2}))?$/;

/** "10" → 1000; "-15" → -1500; "12,5" → 1250. Negativo só quando permitido. */
export function textoParaBp(
  texto: string,
  opcoes: { permitirNegativo?: boolean } = {},
): number | null {
  const m = REGEX_PCT.exec(texto.trim().replace(/\s|%/g, ''));
  if (!m) return null;
  const [, sinal, inteiro = '0', decimal = ''] = m;
  if (sinal && !opcoes.permitirNegativo) return null;
  const bp = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
  return sinal && bp !== 0 ? -bp : bp;
}

/** 1000 → "10"; -1500 → "-15"; 1250 → "12,5". */
export function bpParaTexto(bp: number | null | undefined): string {
  if (bp === null || bp === undefined) return '';
  const abs = Math.abs(bp);
  const inteiro = Math.trunc(abs / 100);
  const decimal = (abs % 100).toString().padStart(2, '0').replace(/0+$/, '');
  return `${bp < 0 ? '-' : ''}${inteiro}${decimal ? `,${decimal}` : ''}`;
}

export function minutosParaHm(minutos: number): { horas: number; minutos: number } {
  return { horas: Math.trunc(minutos / 60), minutos: minutos % 60 };
}

export function hmParaMinutos(horas: number, minutos: number): number {
  return Math.max(0, Math.trunc(horas)) * 60 + Math.max(0, Math.trunc(minutos));
}

/** 240 → "4h"; 270 → "4h30"; 45 → "45min". */
export function formatarDuracao(minutos: number): string {
  const { horas, minutos: m } = minutosParaHm(minutos);
  if (horas === 0) return `${m}min`;
  return m === 0 ? `${horas}h` : `${horas}h${m.toString().padStart(2, '0')}`;
}

export const ROTULOS_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
export const INICIAIS_DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;

/** Liga/desliga um dia (0 = domingo), mantendo a lista ordenada e sem repetição. */
export function alternarDia(dias: readonly number[], dia: number): number[] {
  const conjunto = new Set(dias);
  if (conjunto.has(dia)) conjunto.delete(dia);
  else conjunto.add(dia);
  return [...conjunto].sort((a, b) => a - b);
}

/** [0..6] → "Todos os dias"; [6] → "Sáb"; [1,2,3,4] → "Seg a Qui"; [0,6] → "Dom, Sáb". */
export function resumirDias(dias: readonly number[]): string {
  const ordenados = [...new Set(dias)].sort((a, b) => a - b);
  if (ordenados.length === 7) return 'Todos os dias';
  if (ordenados.length === 0) return 'Nenhum dia';
  const sequencia = ordenados.every((d, i) => i === 0 || d === ordenados[i - 1]! + 1);
  if (sequencia && ordenados.length >= 3) {
    return `${ROTULOS_DIAS[ordenados[0]!]} a ${ROTULOS_DIAS[ordenados.at(-1)!]}`;
  }
  return ordenados.map((d) => ROTULOS_DIAS[d]).join(', ');
}

/** "15:00" ou "15:00:00" → "15:00"; inválido → null. */
export function normalizarHora(texto: string): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(texto.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

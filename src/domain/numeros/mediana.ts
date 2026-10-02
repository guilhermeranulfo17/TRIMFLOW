/** Mediana de inteiros (média dos dois do meio, arredondada meio para cima). Vazio = null. */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio]! : Math.floor((v[meio - 1]! + v[meio]!) / 2 + 0.5);
}

/** Razão em basis points (1% = 100 bp), meio para cima. Denominador zero = null. */
export function razaoBp(numerador: number, denominador: number): number | null {
  if (denominador <= 0) return null;
  return Math.floor((numerador * 10_000) / denominador + 0.5);
}

/** Variação do atual contra o anterior, em bp. Anterior zero = null (não dá para comparar). */
export function variacaoBp(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  const v = ((atual - anterior) * 10_000) / anterior;
  return v >= 0 ? Math.floor(v + 0.5) : -Math.floor(-v + 0.5);
}

/** "12 min", "2 h 5 min", "1 dia 3 h". */
export function formatarMinutos(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'dia' : 'dias'}${h % 24 ? ` ${h % 24} h` : ''}`;
}

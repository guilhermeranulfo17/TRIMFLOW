/**
 * Cor da marca na página pública: texto com contraste AA (4,5:1) sobre a cor e variações.
 * Cor inválida → verde-petróleo (padrão do buffet; o limão é só do Orkestra).
 */
export const COR_PADRAO = '#0F766E';
const ESCURO = '#161616';
const BRANCO = '#FFFFFF';

export type CoresMarca = {
  /** fundo dos botões principais */
  base: string;
  /** texto sobre a base (branco ou quase preto, o de maior contraste) */
  texto: string;
  /** a cor usada como texto/borda sobre fundo branco, escurecida até 4,5:1 */
  destaque: string;
  /** fundo bem claro (seleção, chips) */
  suave: string;
};

export function hexValido(cor: string | null | undefined): cor is string {
  return typeof cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cor);
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

function luminancia(cor: string): number {
  const [r, g, b] = rgb(cor).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores (1 a 21). */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Mistura `cor` com `outra` (0 = cor, 1 = outra). */
export function misturar(cor: string, outra: string, peso: number): string {
  const a = rgb(cor);
  const b = rgb(outra);
  return hex([0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * peso) as [number, number, number]);
}

export function coresDaMarca(cor: string | null | undefined): CoresMarca {
  const base = hexValido(cor) ? cor.toUpperCase() : COR_PADRAO;
  const texto = contraste(base, BRANCO) >= contraste(base, ESCURO) ? BRANCO : ESCURO;
  let destaque = base;
  for (let peso = 0.1; contraste(destaque, BRANCO) < 4.5 && peso <= 1; peso += 0.1) {
    destaque = misturar(base, ESCURO, peso);
  }
  return { base, texto, destaque, suave: misturar(base, BRANCO, 0.9) };
}

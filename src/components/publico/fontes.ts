import { Cormorant_Garamond, Fredoka } from 'next/font/google';
import type { EstiloPagina } from '@/domain/publico/pagina';

/*
 * Fontes dos títulos da página pública (Etapa 9.5). Sem preload: o navegador só baixa a fonte
 * que algum elemento usa, então a página de um buffet "festivo" nunca baixa a do "elegante".
 * display: swap e subset latin protegem o LCP; o fallback ajustado evita salto de layout.
 * "limpo" usa a Manrope do layout raiz.
 */
const festivo = Fredoka({
  subsets: ['latin'],
  weight: '700',
  display: 'swap',
  preload: false,
  variable: '--font-festivo',
});

const elegante = Cormorant_Garamond({
  subsets: ['latin'],
  weight: '700',
  display: 'swap',
  preload: false,
  variable: '--font-elegante',
});

/** Classe que declara só a variável da fonte do estilo (as outras nem entram no HTML). */
export function classeDaFonte(estilo: EstiloPagina): string {
  if (estilo === 'festivo') return festivo.variable;
  if (estilo === 'elegante') return elegante.variable;
  return '';
}

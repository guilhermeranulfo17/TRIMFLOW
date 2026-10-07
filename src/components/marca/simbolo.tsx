/*
 * Símbolo do Orkestra (outubro de 2026): o "O" do logotipo em preto sobre o limão da marca, num
 * quadrado arredondado. Serve onde o nome não cabe (cabeçalho do celular, ícones do app).
 */

export const LIMAO = '#B2F759';
export const GRAFITE = '#0C0C0C';

/** O "O" do logotipo (mesmo traçado de logotipo.tsx), no quadro 0..100. */
const O =
  'M41.7 0.0L50.5 -0.6L61.9 0.6L70.5 3.4L79.0 8.2L86.2 14.3L92.6 21.9L97.5 32.4L100.1 41.9L100.7 50.5L99.3 61.0L96.5 69.5L91.7 78.1L85.2 85.7L76.2 92.7L68.6 96.5L59.0 99.0L47.6 99.7L38.1 98.6L28.6 95.5L20.0 90.6L13.3 84.7L6.5 76.2L2.4 67.6L-0.4 57.1L-0.5 43.8L0.7 37.1L3.8 28.6L8.2 21.0L17.1 11.2L25.7 5.4L34.3 1.7ZM47.6 13.3L38.1 14.9L33.3 16.9L26.7 21.5L21.5 26.7L17.9 32.4L15.0 40.0L13.8 46.7L13.9 54.3L15.7 61.9L17.7 66.7L20.5 71.4L25.7 77.2L31.4 81.3L37.1 84.1L45.7 85.9L52.4 86.1L61.9 84.2L66.7 82.1L73.3 77.6L77.6 73.3L81.5 67.6L84.0 61.9L85.1 58.1L85.9 47.6L85.1 41.0L82.3 33.3L78.3 26.7L73.3 21.4L68.6 17.9L61.9 14.9L58.1 13.9Z';

const CORPO = `<rect width="100" height="100" rx="24" fill="${LIMAO}"/><path transform="translate(21.5 21.8) scale(0.56)" fill="${GRAFITE}" fill-rule="evenodd" d="${O}"/>`;

export function Simbolo({ className, titulo }: { className?: string; titulo?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: CORPO }}
    />
  );
}

/** O símbolo como texto SVG (ícones e imagens geradas no servidor). */
export function svgDoSimbolo(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${CORPO}</svg>`;
}

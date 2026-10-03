/*
 * Símbolo do Orkestra (Etapa 9.6), desenhado pela construção do manual de marca: anel grosso com
 * o ponto limão no eixo de 45°, tangente ao círculo interno, e uma folga em volta do ponto (o anel
 * é cortado ali). O contorno é calculado uma vez, sem máscara (nada de id duplicado na página).
 * Quando os SVGs oficiais chegarem, a troca é só neste arquivo (e em public/marca/).
 */

const C = { x: 46, y: 54 };
const R = 38; // raio externo
const r = 23; // raio interno
const RP = 10; // raio do ponto
const G = RP + 3.5; // raio da folga
const D = r + RP; // centro do ponto: tangente ao círculo interno, no eixo de 45°
const T0 = Math.PI / 4;

const pt = (raio: number, t: number) => ({
  x: C.x + raio * Math.cos(t),
  y: C.y - raio * Math.sin(t),
});
const PONTO = pt(D, T0);
/** Ângulo (a partir do eixo do ponto) onde o círculo de raio `raio` cruza a folga. */
const meia = (raio: number) => Math.acos((raio * raio + D * D - G * G) / (2 * raio * D));
const f = (n: number) => n.toFixed(3);

const A = pt(R, T0 + meia(R));
const B = pt(R, T0 - meia(R));
const Q1 = pt(r, T0 + meia(r));
const Q2 = pt(r, T0 - meia(r));

/** Anel em "C": externo (longo) → folga → interno (longo, voltando) → folga. */
const CONTORNO = [
  `M${f(A.x)} ${f(A.y)}`,
  `A${R} ${R} 0 1 0 ${f(B.x)} ${f(B.y)}`,
  `A${G} ${G} 0 0 1 ${f(Q2.x)} ${f(Q2.y)}`,
  `A${r} ${r} 0 1 1 ${f(Q1.x)} ${f(Q1.y)}`,
  `A${G} ${G} 0 0 1 ${f(A.x)} ${f(A.y)}`,
  'Z',
].join('');

export function Simbolo({
  className,
  anel = 'currentColor',
  ponto = '#3EE42E',
  titulo,
}: {
  className?: string;
  anel?: string;
  ponto?: string;
  titulo?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
      focusable="false"
    >
      <path fill={anel} d={CONTORNO} />
      <circle cx={f(PONTO.x)} cy={f(PONTO.y)} r={RP} fill={ponto} />
    </svg>
  );
}

/** O símbolo como texto SVG (imagens geradas no servidor, como a de compartilhamento). */
export function svgDoSimbolo(anel: string, ponto = '#3EE42E'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="${anel}" d="${CONTORNO}"/><circle cx="${f(PONTO.x)}" cy="${f(PONTO.y)}" r="${RP}" fill="${ponto}"/></svg>`;
}

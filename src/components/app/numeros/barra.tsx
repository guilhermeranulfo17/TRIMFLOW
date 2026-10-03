/** Barra horizontal em SVG (0 a 100%), no tom de destaque, sobre um trilho discreto. */
export function Barra({
  fracao,
  tom = 'primary',
}: {
  fracao: number;
  tom?: 'primary' | 'destaque';
}) {
  const largura = Math.max(0, Math.min(1, fracao)) * 100;
  return (
    <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2.5 w-full" aria-hidden>
      <rect x={0} y={0} width={100} height={8} rx={4} className="fill-muted" />
      {largura > 0 && (
        <rect
          x={0}
          y={0}
          width={Math.max(largura, 1.5)}
          height={8}
          rx={4}
          className={tom === 'primary' ? 'fill-primary-texto' : 'fill-destaque'}
        />
      )}
    </svg>
  );
}

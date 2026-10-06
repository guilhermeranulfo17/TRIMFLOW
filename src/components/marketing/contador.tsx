'use client';

import { useEffect, useRef } from 'react';
import { formatBRL } from '@/domain/money';

/**
 * Valor que "corre" até o total (decoração do hero). O HTML já vem com o valor final; com
 * movimento reduzido, fica parado.
 */
export function ContadorValor({
  centavos,
  duracao = 1600,
}: {
  centavos: number;
  duracao?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let quadro = 0;
    const inicio = performance.now() + 500;
    const passo = (agora: number) => {
      const t = Math.min(1, Math.max(0, (agora - inicio) / duracao));
      const suave = 1 - Math.pow(1 - t, 3);
      el.textContent = formatBRL(Math.round((centavos * suave) / 100) * 100);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [centavos, duracao]);
  return <span ref={ref}>{formatBRL(centavos)}</span>;
}

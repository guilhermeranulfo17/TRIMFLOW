'use client';

import { useEffect } from 'react';

/**
 * Um só ouvinte de ponteiro para a página: o cartão `.ld-holofote` sob o mouse recebe --x/--y e o
 * brilho limão segue o ponteiro (CSS). No toque não faz nada.
 */
export function Holofote() {
  useEffect(() => {
    let pendente = 0;
    function mover(e: PointerEvent) {
      if (e.pointerType !== 'mouse' || pendente) return;
      pendente = requestAnimationFrame(() => {
        pendente = 0;
        const alvo = (e.target as Element | null)?.closest?.('.ld-holofote');
        if (!(alvo instanceof HTMLElement)) return;
        const r = alvo.getBoundingClientRect();
        alvo.style.setProperty('--x', `${e.clientX - r.left}px`);
        alvo.style.setProperty('--y', `${e.clientY - r.top}px`);
      });
    }
    document.addEventListener('pointermove', mover, { passive: true });
    return () => {
      document.removeEventListener('pointermove', mover);
      cancelAnimationFrame(pendente);
    };
  }, []);
  return null;
}

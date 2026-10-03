'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  fotos: string[];
  /** nome do pacote (texto alternativo e rótulos) */
  nome: string;
  className?: string;
  /** primeira foto sem lazy (ex.: dentro da gaveta aberta) */
  prioridade?: boolean;
  sizes?: string;
};

/**
 * Carrossel próprio: CSS scroll-snap (arrastar no celular), setas no PC e teclado (← →). Sem
 * dependência. Uma foto só = sem controles.
 */
export function Carrossel({ fotos, nome, className = '', prioridade = false, sizes }: Props) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const total = fotos.length;

  useEffect(() => {
    const el = trilho.current;
    if (!el || total < 2) return;
    const aoRolar = () => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      setAtual(Math.min(total - 1, Math.max(0, i)));
    };
    el.addEventListener('scroll', aoRolar, { passive: true });
    return () => el.removeEventListener('scroll', aoRolar);
  }, [total]);

  const ir = useCallback(
    (i: number) => {
      const el = trilho.current;
      if (!el) return;
      const alvo = (i + total) % total;
      el.scrollTo({ left: alvo * el.clientWidth });
      setAtual(alvo);
    },
    [total],
  );

  if (total === 0) return null;

  return (
    <div
      className={`group/carrossel relative ${className}`}
      role="region"
      aria-roledescription="carrossel"
      aria-label={`Fotos de ${nome}`}
      onKeyDown={(e) => {
        if (total < 2) return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          ir(atual + 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          ir(atual - 1);
        }
      }}
    >
      <div
        ref={trilho}
        className="carrossel flex size-full overflow-x-auto"
        tabIndex={total > 1 ? 0 : -1}
      >
        {fotos.map((url, i) => (
          <div
            key={url}
            className="relative size-full shrink-0"
            role="group"
            aria-roledescription="foto"
            aria-label={`${i + 1} de ${total}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- fotos já em WEBP no tamanho certo */}
            <img
              src={url}
              alt={total > 1 ? `${nome}, foto ${i + 1}` : nome}
              loading={prioridade && i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              sizes={sizes}
              className="size-full object-cover"
            />
          </div>
        ))}
      </div>
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => ir(atual - 1)}
            className="absolute top-1/2 left-2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-neutral-900 shadow focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:outline-none md:grid"
            aria-label="Foto anterior"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => ir(atual + 1)}
            className="absolute top-1/2 right-2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-neutral-900 shadow focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:outline-none md:grid"
            aria-label="Próxima foto"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5"
            aria-hidden
          >
            {fotos.map((url, i) => (
              <span
                key={url}
                className={`h-1.5 rounded-full bg-white shadow transition-all motion-reduce:transition-none ${
                  i === atual ? 'w-4' : 'w-1.5 opacity-60'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

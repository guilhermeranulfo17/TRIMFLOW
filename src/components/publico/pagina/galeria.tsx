'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

export type FotoGaleria = {
  id: string;
  url640: string;
  url1280: string;
  largura: number;
  altura: number;
  blur: string | null;
  alt: string;
};

const GRANDE = 'md:col-span-2 md:row-span-2';
const LARGA = 'md:col-span-2';

/**
 * Mosaico do PC (4 colunas): a primeira foto em 2x2 e as demais em células simples, com a
 * última linha esticada para nunca sobrar buraco. No celular, 2 colunas iguais.
 */
export function classesMosaico(n: number): string[] {
  const c: string[] = Array.from({ length: n }, () => '');
  if (n === 0) return c;
  if (n === 1) return ['md:col-span-4 md:row-span-2'];
  if (n === 2) return [GRANDE, GRANDE];
  c[0] = GRANDE;
  if (n === 3) return [GRANDE, LARGA, LARGA];
  if (n === 4) return [GRANDE, LARGA, '', ''];
  // 5 fotos fecham as duas primeiras linhas; o resto vai de 4 em 4
  const sobra = (n - 5) % 4;
  if (sobra === 1) {
    // a segunda foto ocupa duas células: sobram 2 na última linha, e elas esticam
    c[1] = LARGA;
    c[n - 1] = c[n - 2] = LARGA;
  }
  if (sobra === 2) c[n - 1] = c[n - 2] = LARGA;
  if (sobra === 3) c[n - 3] = LARGA;
  return c;
}

/**
 * Galeria em mosaico (PC) ou 2 colunas (celular), com lightbox em <dialog>: setas, teclado
 * (← → e Esc), arrastar no celular e foco devolvido à foto que abriu.
 */
export function GaleriaPublica({ fotos }: { fotos: FotoGaleria[] }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const toque = useRef<number | null>(null);
  const [atual, setAtual] = useState<number | null>(null);
  const total = fotos.length;

  const abrir = (i: number) => {
    setAtual(i);
    dialogo.current?.showModal();
  };
  const ir = useCallback(
    (passo: number) => setAtual((a) => (a === null ? a : (a + passo + total) % total)),
    [total],
  );

  const foto = atual === null ? null : fotos[atual];
  const mosaico = classesMosaico(total);

  return (
    <>
      <ul className="grid auto-rows-[160px] grid-cols-2 gap-2 md:auto-rows-[200px] md:grid-cols-4 md:gap-3">
        {fotos.map((f, i) => (
          <li key={f.id} className={mosaico[i]}>
            <button
              type="button"
              ref={(el) => {
                botoes.current[i] = el;
              }}
              onClick={() => abrir(i)}
              className="rounded-foto focus-visible:ring-ring/60 group relative block size-full overflow-hidden bg-cover bg-center focus-visible:ring-[3px] focus-visible:outline-none"
              style={f.blur ? { backgroundImage: `url(${f.blur})` } : undefined}
              aria-label={`Ampliar: ${f.alt}`}
              data-testid="foto-galeria"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- duas larguras em WEBP (srcset) */}
              <img
                src={f.url640}
                srcSet={`${f.url640} 640w, ${f.url1280} 1280w`}
                sizes={i === 0 ? '(min-width: 768px) 50vw, 50vw' : '(min-width: 768px) 25vw, 50vw'}
                width={f.largura}
                height={f.altura}
                alt={f.alt}
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogo}
        className="lightbox m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-white"
        aria-label="Fotos do espaço"
        onClose={() => {
          if (atual !== null) botoes.current[atual]?.focus();
          setAtual(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') ir(1);
          else if (e.key === 'ArrowLeft') ir(-1);
        }}
        onTouchStart={(e) => {
          toque.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const inicio = toque.current;
          const fim = e.changedTouches[0]?.clientX;
          toque.current = null;
          if (inicio === null || fim === undefined || Math.abs(fim - inicio) < 50) return;
          ir(fim < inicio ? 1 : -1);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogo.current?.close();
        }}
        data-testid="lightbox"
      >
        {foto && (
          <div
            className="flex h-full flex-col"
            onClick={(e) => e.target === e.currentTarget && dialogo.current?.close()}
          >
            <div className="flex items-center justify-between p-3">
              <p className="text-sm" aria-live="polite">
                {atual! + 1} de {total}
              </p>
              <button
                type="button"
                onClick={() => dialogo.current?.close()}
                className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:outline-none"
                aria-label="Fechar"
              >
                <X className="size-6" aria-hidden />
              </button>
            </div>
            <figure className="relative flex min-h-0 flex-1 items-center justify-center px-2 md:px-20">
              {/* eslint-disable-next-line @next/next/no-img-element -- foto de 1280 px em WEBP */}
              <img
                key={foto.id}
                src={foto.url1280}
                srcSet={`${foto.url640} 640w, ${foto.url1280} 1280w`}
                sizes="100vw"
                width={foto.largura}
                height={foto.altura}
                alt={foto.alt}
                className="max-h-full w-auto max-w-full object-contain"
                data-testid="lightbox-foto"
              />
              <figcaption className="sr-only">{foto.alt}</figcaption>
              {total > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => ir(-1)}
                    className="absolute left-2 grid size-12 place-items-center rounded-full bg-white/15 hover:bg-white/25 focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:outline-none md:left-6"
                    aria-label="Foto anterior"
                  >
                    <ChevronLeft className="size-7" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => ir(1)}
                    className="absolute right-2 grid size-12 place-items-center rounded-full bg-white/15 hover:bg-white/25 focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:outline-none md:right-6"
                    aria-label="Próxima foto"
                  >
                    <ChevronRight className="size-7" aria-hidden />
                  </button>
                </>
              )}
            </figure>
            <p className="p-4 text-center text-sm text-white/90">{foto.alt}</p>
          </div>
        )}
      </dialog>
    </>
  );
}

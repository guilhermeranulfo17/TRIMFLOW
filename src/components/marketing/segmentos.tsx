'use client';

import { Check } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type Segmento = { chave: string; rotulo: string; titulo: string; frases: string[] };

/** "Para quem é": abas acessíveis (setas, Home e End trocam a aba). */
export function AbasSegmento({ segmentos }: { segmentos: Segmento[] }) {
  const id = useId();
  const [ativo, setAtivo] = useState(0);
  const abas = useRef<(HTMLButtonElement | null)[]>([]);

  function teclado(e: React.KeyboardEvent, i: number) {
    const n = segmentos.length;
    const alvo =
      e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (alvo === null) return;
    e.preventDefault();
    setAtivo(alvo);
    abas.current[alvo]?.focus();
  }

  return (
    <div className="mt-10">
      <div
        role="tablist"
        aria-label="Tipos de buffet"
        className="ld-vidro -mx-1 flex gap-1 overflow-x-auto rounded-full p-1"
      >
        {segmentos.map((s, i) => (
          <button
            key={s.chave}
            ref={(el) => {
              abas.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-aba-${i}`}
            aria-selected={ativo === i}
            aria-controls={`${id}-painel-${i}`}
            tabIndex={ativo === i ? 0 : -1}
            onClick={() => setAtivo(i)}
            onKeyDown={(e) => teclado(e, i)}
            className={cn(
              'focus-visible:ring-ring/60 min-h-11 flex-1 shrink-0 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:outline-none',
              ativo === i ? 'bg-primary text-primary-foreground' : 'hover:bg-white/5',
            )}
          >
            {s.rotulo}
          </button>
        ))}
      </div>
      {segmentos.map((s, i) => (
        <div
          key={s.chave}
          role="tabpanel"
          id={`${id}-painel-${i}`}
          aria-labelledby={`${id}-aba-${i}`}
          hidden={ativo !== i}
          tabIndex={0}
          className="ld-vidro ld-holofote mt-4 rounded-[28px] p-7 md:p-10"
        >
          <h3 className="text-2xl font-bold tracking-tight">{s.titulo}</h3>
          <ul className="mt-5 space-y-3">
            {s.frases.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <span className="bg-primary text-primary-foreground mt-0.5 grid size-6 shrink-0 place-items-center rounded-full">
                  <Check className="size-4" aria-hidden />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

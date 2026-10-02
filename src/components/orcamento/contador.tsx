'use client';

import { Minus, Plus } from 'lucide-react';

/** Campo numérico com botões grandes de − e + (toque ≥ 48 px). */
export function Contador({
  id,
  rotulo,
  dica,
  valor,
  min = 0,
  max = 10_000,
  aoMudar,
}: {
  id: string;
  rotulo: string;
  dica?: string;
  valor: number;
  min?: number;
  max?: number;
  aoMudar: (v: number) => void;
}) {
  const ajustar = (v: number) =>
    aoMudar(Math.min(max, Math.max(min, Number.isFinite(v) ? v : min)));
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <label htmlFor={id} className="min-w-0">
        <span className="block font-semibold">{rotulo}</span>
        {dica && <span className="text-muted-foreground block text-sm">{dica}</span>}
      </label>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => ajustar(valor - 1)}
          disabled={valor <= min}
          className="hover:bg-accent grid size-12 place-items-center rounded-full border disabled:opacity-40"
          aria-label={`Diminuir ${rotulo.toLowerCase()}`}
        >
          <Minus className="size-5" aria-hidden />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={valor}
          onChange={(e) => ajustar(parseInt(e.target.value || '0', 10))}
          className="focus-visible:ring-ring/50 rounded-control h-12 w-16 border text-center text-base font-bold focus-visible:ring-[3px] focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={() => ajustar(valor + 1)}
          disabled={valor >= max}
          className="hover:bg-accent grid size-12 place-items-center rounded-full border disabled:opacity-40"
          aria-label={`Aumentar ${rotulo.toLowerCase()}`}
        >
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Classes de um cartão de opção (radio/checkbox grande). */
export function classeOpcao(selecionado: boolean, desabilitado = false): string {
  return [
    'flex w-full min-h-14 items-center gap-3 rounded-card border-2 p-4 text-left transition-colors',
    'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
    selecionado ? 'border-primary bg-accent' : 'border-border bg-card hover:border-ring/60',
    desabilitado ? 'cursor-not-allowed opacity-60 hover:border-border' : '',
  ].join(' ');
}

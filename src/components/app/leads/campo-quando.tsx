'use client';

import { classeCampo } from '@/components/app/form/estilos';
import { cn } from '@/lib/utils';

const ATALHOS = ['hoje 18h', 'amanhã 9h', 'amanhã 14h', 'em 3 dias', 'em 7 dias'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Dia e hora: atalhos de um toque ("amanhã 9h") ou o campo de data e hora. O texto vai para o
 * servidor, que interpreta no fuso da empresa (domain/leads/adiar).
 */
export function CampoQuando({
  id,
  valor,
  onChange,
  erro,
  atalhos = ATALHOS,
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  erro?: string;
  atalhos?: string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Atalhos de dia e hora">
        {atalhos.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={valor === a}
            onClick={() => onChange(a)}
            className={cn(
              'min-h-10 rounded-full border px-3 text-sm font-semibold',
              valor === a ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent',
            )}
          >
            {a}
          </button>
        ))}
      </div>
      <input
        id={id}
        type="datetime-local"
        aria-label="Dia e hora"
        className={classeCampo}
        value={ISO.test(valor) ? valor : ''}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!erro || undefined}
      />
      {erro && (
        <p className="text-destructive text-xs" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

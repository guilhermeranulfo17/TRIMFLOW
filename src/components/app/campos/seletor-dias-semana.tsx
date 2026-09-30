'use client';

import { alternarDia, INICIAIS_DIAS } from '@/domain/conversao';
import { cn } from '@/lib/utils';

const NOMES = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

/** 7 botões (D S T Q Q S S). Guarda os dias ligados: 0 = domingo … 6 = sábado. */
export function SeletorDiasSemana({
  id,
  valor,
  onChange,
  disabled,
}: {
  id: string;
  valor: number[];
  onChange: (dias: number[]) => void;
  disabled?: boolean;
}) {
  return (
    <div id={id} role="group" className="grid grid-cols-7 gap-1.5">
      {INICIAIS_DIAS.map((inicial, dia) => {
        const ligado = valor.includes(dia);
        return (
          <button
            key={dia}
            type="button"
            disabled={disabled}
            aria-pressed={ligado}
            aria-label={NOMES[dia]}
            onClick={() => onChange(alternarDia(valor, dia))}
            className={cn(
              'rounded-control grid h-11 place-items-center border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              ligado
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-muted',
            )}
          >
            {inicial}
          </button>
        );
      })}
    </div>
  );
}

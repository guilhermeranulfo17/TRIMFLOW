'use client';

import { ESTADOS, RESUMOS } from '@/components/app/agenda/estados';
import type { Calendario, EstadoSlot } from '@/domain/agenda';
import { ROTULOS_DIAS } from '@/domain/conversao';
import { cn } from '@/lib/utils';

const ORDEM: EstadoSlot[] = ['reservado', 'lotado', 'pre_reservado', 'bloqueado', 'livre'];

/** Calendário mensal do desktop: cada dia com bolinhas por estado. */
export function CalendarioMes({
  calendario,
  hoje,
  onAbrirDia,
}: {
  calendario: Calendario;
  hoje: string;
  onAbrirDia: (data: string) => void;
}) {
  return (
    <div className="rounded-card overflow-hidden border" role="grid" aria-label="Calendário do mês">
      <div className="bg-muted/50 grid grid-cols-7 text-center text-xs font-semibold" role="row">
        {ROTULOS_DIAS.map((d) => (
          <div key={d} className="py-2" role="columnheader">
            {d}
          </div>
        ))}
      </div>
      {calendario.semanas.map((semana) => (
        <div key={semana[0]!.data} className="grid grid-cols-7" role="row">
          {semana.map((dia) => (
            <button
              key={dia.data}
              type="button"
              role="gridcell"
              onClick={() => onAbrirDia(dia.data)}
              aria-label={`${dia.data.slice(8)}: ${RESUMOS[dia.resumo].rotulo}`}
              data-testid={`dia-${dia.data}`}
              data-resumo={dia.resumo}
              className={cn(
                'hover:bg-accent/60 flex min-h-24 flex-col items-start gap-1 border-t border-l p-2 text-left transition-colors',
                RESUMOS[dia.resumo].fundo,
                !dia.doMes && 'opacity-40',
              )}
            >
              <span
                className={cn(
                  'grid size-7 place-items-center rounded-full text-sm font-semibold',
                  dia.data === hoje && 'bg-primary text-primary-foreground',
                )}
              >
                {Number(dia.data.slice(8))}
              </span>
              <span className="flex flex-wrap gap-1" aria-hidden>
                {ORDEM.flatMap((estado) =>
                  Array.from({ length: Math.min(dia.contagem[estado], 6) }, (_, i) => (
                    <span
                      key={`${estado}-${i}`}
                      className={cn('size-2.5 rounded-full', ESTADOS[estado].ponto)}
                    />
                  )),
                )}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

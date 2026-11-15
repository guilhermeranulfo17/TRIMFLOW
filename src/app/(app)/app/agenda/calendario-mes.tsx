'use client';

import { ESTADOS, RESUMOS, textoMarcacao } from '@/components/app/agenda/estados';
import { marcacoesDoDia, type Calendario } from '@/domain/agenda';
import { ROTULOS_DIAS } from '@/domain/conversao';
import { cn } from '@/lib/utils';

/**
 * Calendário mensal do desktop. Dia sem nada marcado fica limpo; com reserva, pré-reserva ou
 * bloqueio, ganha um fundo bem leve na cor do estado mais forte e a lista curta dos turnos
 * ("1 reservado", "2 livres"), sem bolinhas.
 */
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
          {semana.map((dia) => {
            const m = marcacoesDoDia(dia.contagem);
            const descricao = m.itens.length
              ? m.itens.map((i) => textoMarcacao(i.estado, i.quantidade)).join(', ')
              : RESUMOS[dia.resumo].rotulo;
            return (
              <button
                key={dia.data}
                type="button"
                role="gridcell"
                onClick={() => onAbrirDia(dia.data)}
                aria-label={`${dia.data.slice(8)}: ${descricao}`}
                data-testid={`dia-${dia.data}`}
                data-resumo={dia.resumo}
                data-cor={m.cor ?? 'nenhuma'}
                className={cn(
                  'bg-card hover:bg-accent/60 flex min-h-24 flex-col items-start gap-1 border-t border-l p-2 text-left transition-colors',
                  m.cor && ESTADOS[m.cor].fundo,
                  dia.resumo === 'sem_turno' && 'text-muted-foreground',
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
                {m.itens.length > 0 && (
                  <span className="flex flex-col gap-0.5 text-xs leading-tight" aria-hidden>
                    {m.itens.map((i) => (
                      <span key={i.estado} className={cn('font-semibold', ESTADOS[i.estado].texto)}>
                        {textoMarcacao(i.estado, i.quantidade)}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

import type { EstadoSlot, ResumoDia } from '@/domain/agenda';
import { cn } from '@/lib/utils';

/** Rótulo e cor de cada estado de slot (a mesma cor em lista, calendário e painel). */
export const ESTADOS: Record<EstadoSlot, { rotulo: string; ponto: string; selo: string }> = {
  livre: {
    rotulo: 'Livre',
    ponto: 'bg-primary',
    selo: 'bg-primary/10 text-primary border-primary/30',
  },
  pre_reservado: {
    rotulo: 'Pré-reservado',
    ponto: 'bg-amber-400',
    selo: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
  },
  reservado: {
    rotulo: 'Reservado',
    ponto: 'bg-violet-400',
    selo: 'bg-violet-400/10 text-violet-300 border-violet-400/30',
  },
  lotado: {
    rotulo: 'Lotado',
    ponto: 'bg-violet-400',
    selo: 'bg-violet-400/10 text-violet-300 border-violet-400/30',
  },
  bloqueado: {
    rotulo: 'Bloqueado',
    ponto: 'bg-zinc-500',
    selo: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40',
  },
};

export const RESUMOS: Record<ResumoDia, { rotulo: string; fundo: string }> = {
  sem_turno: { rotulo: 'Sem turno', fundo: 'bg-muted/40 text-muted-foreground' },
  livre: { rotulo: 'Livre', fundo: 'bg-card' },
  parcial: { rotulo: 'Parcialmente ocupado', fundo: 'bg-amber-400/10' },
  cheio: { rotulo: 'Cheio', fundo: 'bg-violet-400/15' },
  bloqueado: { rotulo: 'Bloqueado', fundo: 'bg-zinc-500/20' },
};

export function SeloEstado({
  estado,
  className,
  children,
}: {
  estado: EstadoSlot;
  className?: string;
  children?: React.ReactNode;
}) {
  const e = ESTADOS[estado];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold',
        e.selo,
        className,
      )}
    >
      <span className={cn('size-2 rounded-full', e.ponto)} aria-hidden />
      {children ?? e.rotulo}
    </span>
  );
}

export function Legenda() {
  const itens: EstadoSlot[] = ['livre', 'pre_reservado', 'reservado', 'bloqueado'];
  return (
    <ul
      className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
      aria-label="Legenda"
    >
      {itens.map((e) => (
        <li key={e} className="flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-full', ESTADOS[e].ponto)} aria-hidden />
          {ESTADOS[e].rotulo}
        </li>
      ))}
    </ul>
  );
}

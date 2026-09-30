import type { EstadoSlot, ResumoDia } from '@/domain/agenda';
import { cn } from '@/lib/utils';

/** Rótulo e cor de cada estado de slot (a mesma cor em lista, calendário e painel). */
export const ESTADOS: Record<EstadoSlot, { rotulo: string; ponto: string; selo: string }> = {
  livre: {
    rotulo: 'Livre',
    ponto: 'bg-emerald-500',
    selo: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  pre_reservado: {
    rotulo: 'Pré-reservado',
    ponto: 'bg-amber-500',
    selo: 'bg-amber-50 text-amber-900 border-amber-200',
  },
  reservado: {
    rotulo: 'Reservado',
    ponto: 'bg-violet-600',
    selo: 'bg-violet-50 text-violet-900 border-violet-200',
  },
  lotado: {
    rotulo: 'Lotado',
    ponto: 'bg-violet-600',
    selo: 'bg-violet-50 text-violet-900 border-violet-200',
  },
  bloqueado: {
    rotulo: 'Bloqueado',
    ponto: 'bg-slate-500',
    selo: 'bg-slate-100 text-slate-800 border-slate-300',
  },
};

export const RESUMOS: Record<ResumoDia, { rotulo: string; fundo: string }> = {
  sem_turno: { rotulo: 'Sem turno', fundo: 'bg-muted/40 text-muted-foreground' },
  livre: { rotulo: 'Livre', fundo: 'bg-card' },
  parcial: { rotulo: 'Parcialmente ocupado', fundo: 'bg-amber-50/60' },
  cheio: { rotulo: 'Cheio', fundo: 'bg-violet-50' },
  bloqueado: { rotulo: 'Bloqueado', fundo: 'bg-slate-100' },
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

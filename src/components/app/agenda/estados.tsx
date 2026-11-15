import type { EstadoSlot, Marcacao, ResumoDia } from '@/domain/agenda';
import { cn } from '@/lib/utils';

/**
 * Rótulo e cor de cada estado de slot (a mesma cor em lista, calendário e painel): livre verde,
 * pré-reservado amarelo, reservado azul e bloqueado vermelho. Sem bolinhas: o estado aparece como
 * selo com fundo bem leve.
 */
export const ESTADOS: Record<
  EstadoSlot,
  { rotulo: string; selo: string; fundo: string; texto: string }
> = {
  livre: {
    rotulo: 'Livre',
    selo: 'bg-sucesso/10 text-sucesso border-sucesso/30',
    fundo: 'bg-sucesso/10',
    texto: 'text-sucesso',
  },
  pre_reservado: {
    rotulo: 'Pré-reservado',
    selo: 'bg-alerta/10 text-alerta border-alerta/30',
    fundo: 'bg-alerta/10',
    texto: 'text-alerta',
  },
  reservado: {
    rotulo: 'Reservado',
    selo: 'bg-info/10 text-info border-info/30',
    fundo: 'bg-info/10',
    texto: 'text-info',
  },
  lotado: {
    rotulo: 'Lotado',
    selo: 'bg-info/10 text-info border-info/30',
    fundo: 'bg-info/10',
    texto: 'text-info',
  },
  bloqueado: {
    rotulo: 'Bloqueado',
    selo: 'bg-erro/10 text-erro border-erro/30',
    fundo: 'bg-erro/10',
    texto: 'text-erro',
  },
};

/** Texto curto da marcação no dia do calendário ("2 reservados", "1 livre"). */
const PLURAIS: Record<Marcacao, [string, string]> = {
  reservado: ['reservado', 'reservados'],
  pre_reservado: ['pré-reservado', 'pré-reservados'],
  bloqueado: ['bloqueado', 'bloqueados'],
  livre: ['livre', 'livres'],
};

export const textoMarcacao = (estado: Marcacao, quantidade: number) =>
  `${quantidade} ${PLURAIS[estado][quantidade === 1 ? 0 : 1]}`;

export const RESUMOS: Record<ResumoDia, { rotulo: string }> = {
  sem_turno: { rotulo: 'Sem turno' },
  livre: { rotulo: 'Livre' },
  parcial: { rotulo: 'Parcialmente ocupado' },
  cheio: { rotulo: 'Cheio' },
  bloqueado: { rotulo: 'Bloqueado' },
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
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
        e.selo,
        className,
      )}
    >
      {children ?? e.rotulo}
    </span>
  );
}

export function Legenda() {
  const itens: EstadoSlot[] = ['livre', 'pre_reservado', 'reservado', 'bloqueado'];
  return (
    <ul className="flex flex-wrap gap-2 text-xs" aria-label="Legenda">
      {itens.map((e) => (
        <li key={e}>
          <SeloEstado estado={e} />
        </li>
      ))}
    </ul>
  );
}

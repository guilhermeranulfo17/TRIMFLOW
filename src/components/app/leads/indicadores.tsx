import { Flame, Snowflake, Thermometer } from 'lucide-react';
import { COR_STATUS_LEAD } from '@/domain/leads/exibicao';
import { ROTULO_TEMPERATURA } from '@/domain/leads/temperatura';
import {
  ROTULO_STATUS_LEAD,
  type StatusLead,
  type TemperaturaLead,
} from '@/domain/publico/status-lead';
import { cn } from '@/lib/utils';

/** Selo do status do lead (cor + texto). */
export function SeloStatus({ status, className }: { status: StatusLead; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-semibold',
        COR_STATUS_LEAD[status],
        className,
      )}
      data-testid="selo-status"
    >
      {ROTULO_STATUS_LEAD[status]}
    </span>
  );
}

const TEMP = {
  quente: { Icone: Flame, cor: 'text-rose-600' },
  morno: { Icone: Thermometer, cor: 'text-amber-600' },
  frio: { Icone: Snowflake, cor: 'text-sky-600' },
} as const;

/** Temperatura com ícone, cor e texto (o texto também serve aos leitores de tela). */
export function Temperatura({
  temperatura,
  comTexto = true,
}: {
  temperatura: TemperaturaLead;
  comTexto?: boolean;
}) {
  const { Icone, cor } = TEMP[temperatura];
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', cor)}>
      <Icone className="size-3.5" aria-hidden />
      <span className={comTexto ? '' : 'sr-only'}>{ROTULO_TEMPERATURA[temperatura]}</span>
    </span>
  );
}

/** Iniciais do responsável (com o nome completo para leitores de tela). */
export function Iniciais({ nome, iniciais }: { nome: string; iniciais: string }) {
  return (
    <span
      className="bg-accent text-primary grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold"
      title={`Responsável: ${nome}`}
    >
      <span aria-hidden>{iniciais}</span>
      <span className="sr-only">Responsável: {nome}</span>
    </span>
  );
}

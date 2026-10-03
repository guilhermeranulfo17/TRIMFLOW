import { AlarmClock, CalendarCheck, CalendarClock, ListTodo, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { filtrosParaUrl, type AtalhoCaixa, type FiltrosCaixa } from '@/domain/leads/filtros';
import { cn } from '@/lib/utils';
import type { ResumoHoje } from '@/server/leads/carregar';

const ITENS: {
  atalho: AtalhoCaixa;
  rotulo: string;
  chave: keyof ResumoHoje;
  Icone: typeof ListTodo;
}[] = [
  { atalho: 'pre_reservas', rotulo: 'Pré-reservas', chave: 'preReservas', Icone: CalendarClock },
  { atalho: 'visitas', rotulo: 'Visitas', chave: 'visitas', Icone: CalendarCheck },
  { atalho: 'tarefas_hoje', rotulo: 'Tarefas de hoje', chave: 'tarefasHoje', Icone: ListTodo },
  { atalho: 'atrasadas', rotulo: 'Atrasadas', chave: 'atrasadas', Icone: AlarmClock },
  { atalho: 'novos', rotulo: 'Novos sem contato', chave: 'novos', Icone: UserPlus },
];

/** Topo "Hoje": contadores tocáveis que filtram a lista (tocar de novo tira o filtro). */
export function TopoHoje({ resumo, filtros }: { resumo: ResumoHoje; filtros: FiltrosCaixa }) {
  return (
    <nav aria-label="Hoje" className="-mx-4 overflow-x-auto px-4 pb-1" data-testid="topo-hoje">
      <ul className="flex gap-3 py-1 md:grid md:grid-cols-5">
        {ITENS.map(({ atalho, rotulo, chave, Icone }) => {
          const ativo = filtros.atalho === atalho;
          const qs = filtrosParaUrl({ ...filtros, atalho: ativo ? undefined : atalho });
          const n = resumo[chave];
          // como os blocos da referência: um verde-limão, um claro e o resto grafite
          const tom =
            atalho === 'pre_reservas' ? 'lima' : atalho === 'visitas' ? 'claro' : 'grafite';
          return (
            <li key={atalho} className="shrink-0">
              <Link
                prefetch={false}
                href={`/app/leads${qs ? `?${qs}` : ''}`}
                aria-current={ativo ? 'true' : undefined}
                className={cn(
                  'rounded-card flex min-h-24 min-w-34 flex-col justify-between gap-3 p-4 transition-[box-shadow,filter] hover:brightness-110',
                  tom === 'lima' && 'bg-primary text-primary-foreground',
                  tom === 'claro' && 'bg-destaque text-destaque-foreground',
                  tom === 'grafite' && 'bg-card',
                  ativo && 'ring-foreground ring-offset-background ring-2 ring-offset-2',
                  tom === 'grafite' &&
                    atalho === 'atrasadas' &&
                    n > 0 &&
                    !ativo &&
                    'ring-erro/50 ring-1',
                )}
                data-testid={`hoje-${atalho}`}
              >
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-semibold',
                    tom === 'grafite' ? 'text-muted-foreground' : 'opacity-70',
                  )}
                >
                  <Icone className="size-3.5" aria-hidden />
                  {rotulo}
                </span>
                <span
                  className={cn(
                    'text-4xl leading-none font-light tracking-tight tabular-nums',
                    atalho === 'atrasadas' && n > 0 && 'text-erro',
                  )}
                >
                  {n}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

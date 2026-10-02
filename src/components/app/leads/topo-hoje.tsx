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
      <ul className="flex gap-2 md:grid md:grid-cols-5">
        {ITENS.map(({ atalho, rotulo, chave, Icone }) => {
          const ativo = filtros.atalho === atalho;
          const qs = filtrosParaUrl({ ...filtros, atalho: ativo ? undefined : atalho });
          const n = resumo[chave];
          return (
            <li key={atalho} className="shrink-0">
              <Link
                href={`/app/leads${qs ? `?${qs}` : ''}`}
                aria-current={ativo ? 'true' : undefined}
                className={cn(
                  'rounded-card flex min-h-16 min-w-32 flex-col justify-between gap-1 border p-3 transition-colors',
                  ativo ? 'border-primary bg-accent' : 'bg-card hover:bg-accent',
                  atalho === 'atrasadas' && n > 0 && !ativo && 'border-rose-300',
                )}
                data-testid={`hoje-${atalho}`}
              >
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
                  <Icone className="size-3.5" aria-hidden />
                  {rotulo}
                </span>
                <span
                  className={cn(
                    'text-2xl leading-none font-extrabold tabular-nums',
                    atalho === 'atrasadas' && n > 0 && 'text-rose-700',
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

import Link from 'next/link';
import { PERIODOS, type Periodo } from '@/domain/numeros';
import { formatData } from '@/domain/dates';
import { cn } from '@/lib/utils';

/** Seletor de período (na URL): atalhos e de/até. Funciona sem JavaScript. */
export function SeletorPeriodo({ periodo }: { periodo: Periodo }) {
  return (
    <div className="flex flex-col gap-2">
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Período">
        {PERIODOS.map((p) => (
          <Link
            key={p.chave}
            prefetch={false}
            href={`/app/numeros?periodo=${p.chave}`}
            aria-current={periodo.chave === p.chave ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold',
              periodo.chave === p.chave
                ? 'bg-foreground text-background border-transparent'
                : 'hover:bg-accent',
            )}
            data-testid={`periodo-${p.chave}`}
          >
            {p.rotulo}
          </Link>
        ))}
      </nav>
      <form action="/app/numeros" className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          De
          <input
            type="date"
            name="de"
            defaultValue={periodo.de}
            className="rounded-control bg-input/30 min-h-11 border px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          Até
          <input
            type="date"
            name="ate"
            defaultValue={periodo.ate}
            className="rounded-control bg-input/30 min-h-11 border px-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-control hover:bg-accent min-h-11 border px-3 font-semibold"
        >
          Ver
        </button>
        <span className="text-muted-foreground basis-full" data-testid="periodo-atual">
          {formatData(periodo.de)} a {formatData(periodo.ate)}
        </span>
      </form>
    </div>
  );
}

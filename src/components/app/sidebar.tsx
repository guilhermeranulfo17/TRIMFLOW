'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { BadgePendencia } from './badge-pendencia';
import { PendenteLink } from './pendente-link';
import { itemAtivo, itensNav } from './nav-items';

/** Navegação lateral (desktop, ≥ md). */
export function Sidebar({
  badges = {},
  dono = false,
}: {
  badges?: Record<string, number>;
  dono?: boolean;
}) {
  const pathname = usePathname();
  const itens = itensNav(dono);
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col p-3 md:flex">
      <div className="bg-sidebar rounded-card flex flex-1 flex-col px-3 py-5">
        <Link href="/app/leads" className="mb-8 px-2" aria-label="Orkestra, ir para Leads">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {itens.map(({ href, rotulo, icone: Icone }) => {
            const ativo = itemAtivo(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors',
                  ativo
                    ? 'bg-destaque text-destaque-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icone className="size-5" aria-hidden />
                {rotulo}
                <PendenteLink />
                <BadgePendencia quantidade={badges[href] ?? 0} className="ml-auto" />
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

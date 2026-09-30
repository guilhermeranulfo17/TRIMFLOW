'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { BadgePendencia } from './badge-pendencia';
import { itemAtivo, ITENS_NAV } from './nav-items';

/** Navegação lateral (desktop, ≥ md). */
export function Sidebar({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <aside className="bg-sidebar sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r px-3 py-4 md:flex">
      <Link href="/app/leads" className="mb-6 px-2" aria-label="Orkestra, ir para Leads">
        <Logo />
      </Link>
      <nav aria-label="Principal" className="flex flex-col gap-1">
        {ITENS_NAV.map(({ href, rotulo, icone: Icone }) => {
          const ativo = itemAtivo(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? 'page' : undefined}
              className={cn(
                'rounded-control flex h-11 items-center gap-3 px-3 text-sm font-medium transition-colors',
                ativo
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icone className="size-5" aria-hidden />
              {rotulo}
              <BadgePendencia quantidade={badges[href] ?? 0} className="ml-auto" />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

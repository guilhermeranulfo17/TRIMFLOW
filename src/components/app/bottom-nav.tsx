'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BadgePendencia } from './badge-pendencia';
import { PendenteLink } from './pendente-link';
import { itemAtivo, ITENS_NAV } from './nav-items';

/** Barra de navegação inferior (celular, < md). */
export function BottomNav({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="bg-sidebar fixed inset-x-0 bottom-0 z-30 rounded-t-[22px] border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {ITENS_NAV.map(({ href, rotulo, icone: Icone }) => {
          const ativo = itemAtivo(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-tight font-semibold',
                  ativo ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'relative grid h-7 w-12 place-items-center rounded-full transition-colors',
                    ativo && 'bg-primary text-primary-foreground',
                  )}
                >
                  <Icone className="size-5" aria-hidden />
                  <BadgePendencia
                    quantidade={badges[href] ?? 0}
                    className="absolute -top-2 -right-3"
                  />
                </span>
                <span className="flex max-w-full items-center gap-1 truncate">
                  {rotulo}
                  <PendenteLink className="size-3" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

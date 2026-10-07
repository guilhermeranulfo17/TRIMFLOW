'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BadgePendencia } from './badge-pendencia';
import { PendenteLink } from './pendente-link';
import { itemAtivo, itensNav } from './nav-items';

/** Barra de navegação inferior (celular, < md). */
export function BottomNav({
  badges = {},
  dono = false,
}: {
  badges?: Record<string, number>;
  dono?: boolean;
}) {
  const pathname = usePathname();
  const itens = itensNav(dono, true);
  return (
    <nav
      aria-label="Principal"
      className="bg-sidebar fixed inset-x-0 bottom-0 z-30 rounded-t-[22px] border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className={cn('grid', itens.length > 4 ? 'grid-cols-5' : 'grid-cols-4')}>
        {itens.map(({ href, rotulo, curto, icone: Icone }) => {
          const ativo = itemAtivo(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={ativo ? 'page' : undefined}
                aria-label={rotulo}
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
                  {itens.length > 4 ? (curto ?? rotulo) : rotulo}
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

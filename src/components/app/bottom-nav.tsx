'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { itemAtivo, ITENS_NAV } from './nav-items';

/** Barra de navegação inferior (celular, < md). */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="bg-card fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
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
                  ativo ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icone className="size-5" aria-hidden />
                <span className="max-w-full truncate">{rotulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

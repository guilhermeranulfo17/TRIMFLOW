'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BadgePendencia } from '../badge-pendencia';

export type SecaoEmpresa = { href: string; rotulo: string; badge?: number };

function ativa(pathname: string, href: string) {
  return href === '/app/empresa'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Navegação de Minha empresa: abas no desktop; no celular, um menu de seções recolhível
 * (cada seção abre em tela própria).
 */
export function NavEmpresa({ secoes }: { secoes: SecaoEmpresa[] }) {
  const pathname = usePathname();
  const atual = secoes.find((s) => ativa(pathname, s.href)) ?? secoes[0]!;
  const totalBadges = secoes.reduce((s, x) => s + (x.badge ?? 0), 0);

  return (
    <>
      <nav aria-label="Seções de Minha empresa" className="mb-6 hidden border-b md:block">
        <ul className="-mb-px flex flex-wrap gap-x-1">
          {secoes.map((s) => {
            const estaAtiva = ativa(pathname, s.href);
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={estaAtiva ? 'page' : undefined}
                  className={cn(
                    'flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
                    estaAtiva
                      ? 'border-primary text-foreground'
                      : 'text-muted-foreground hover:text-foreground border-transparent',
                  )}
                >
                  {s.rotulo}
                  <BadgePendencia quantidade={s.badge ?? 0} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <details className="group rounded-card bg-card mb-5 border md:hidden" key={pathname}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm [&::-webkit-details-marker]:hidden">
          <span>
            <span className="text-muted-foreground">Seção: </span>
            <span className="font-semibold">{atual.rotulo}</span>
          </span>
          <span className="flex items-center gap-2">
            <BadgePendencia quantidade={totalBadges} />
            <ChevronDown
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </span>
        </summary>
        <nav aria-label="Seções de Minha empresa (celular)">
          <ul className="border-t py-1">
            {secoes.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={ativa(pathname, s.href) ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center justify-between px-4 text-sm',
                    ativa(pathname, s.href)
                      ? 'text-primary-texto font-semibold'
                      : 'text-foreground',
                  )}
                >
                  {s.rotulo}
                  <BadgePendencia quantidade={s.badge ?? 0} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </details>
    </>
  );
}

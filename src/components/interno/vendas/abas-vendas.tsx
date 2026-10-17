'use client';

import { BookOpen, CalendarCheck, Columns3, Star, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** Abas do Vendas Orkestra (/interno/vendas). A Fila do dia é a tela inicial. */
const ABAS_VENDAS = [
  { href: '/interno/vendas', rotulo: 'Fila do dia', Icone: CalendarCheck },
  { href: '/interno/vendas/pipeline', rotulo: 'Pipeline', Icone: Columns3 },
  { href: '/interno/vendas/leads', rotulo: 'Leads', Icone: Users },
  { href: '/interno/vendas/conhecimento', rotulo: 'Conhecimento', Icone: BookOpen },
  { href: '/interno/vendas/exemplos', rotulo: 'Exemplos', Icone: Star },
] as const;

export function AbasVendas() {
  const caminho = usePathname();
  return (
    <nav aria-label="Vendas Orkestra" className="-mx-4 overflow-x-auto px-4">
      <div className="bg-muted flex w-max gap-0.5 rounded-full p-0.5">
        {ABAS_VENDAS.map(({ href, rotulo, Icone }) => {
          const ativo = href === '/interno/vendas' ? caminho === href : caminho.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap',
                ativo ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
              data-testid={`aba-vendas-${rotulo}`}
            >
              <Icone className="size-4" aria-hidden />
              {rotulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

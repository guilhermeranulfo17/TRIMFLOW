'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { definirMenuRecolhido } from '@/server/actions/menu';
import { Logo } from './logo';
import { BadgePendencia } from './badge-pendencia';
import { PendenteLink } from './pendente-link';
import { itemAtivo, itensNav } from './nav-items';

/**
 * Navegação lateral (desktop, ≥ md). Aberta mostra ícones e nomes; recolhida, só os ícones (o
 * nome aparece ao passar o mouse e para o leitor de tela). A escolha vale para o aparelho
 * (cookie orkestra_menu, lido no servidor para o painel não piscar).
 */
export function Sidebar({
  badges = {},
  dono = false,
  recolhido: recolhidoInicial = false,
}: {
  badges?: Record<string, number>;
  dono?: boolean;
  recolhido?: boolean;
}) {
  const pathname = usePathname();
  const itens = itensNav(dono);
  const [recolhido, setRecolhido] = useState(recolhidoInicial);
  const [, iniciar] = useTransition();

  function alternar() {
    const novo = !recolhido;
    setRecolhido(novo);
    iniciar(() => definirMenuRecolhido(novo));
  }

  const RotuloBotao = recolhido ? 'Abrir o menu' : 'Recolher o menu';
  const IconeBotao = recolhido ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col p-3 transition-[width] duration-200 motion-reduce:transition-none md:flex',
        recolhido ? 'w-[5.5rem]' : 'w-64',
      )}
      data-testid="menu-lateral"
      data-recolhido={recolhido}
    >
      <div
        className={cn(
          'bg-sidebar rounded-card flex flex-1 flex-col py-5',
          recolhido ? 'items-center px-2' : 'px-3',
        )}
      >
        <Link
          href="/app/leads"
          className={cn('mb-8', recolhido ? 'px-0' : 'px-2')}
          aria-label="Orkestra, ir para Leads"
        >
          <Logo compacto={recolhido} />
        </Link>
        <nav
          aria-label="Principal"
          className={cn('flex flex-col gap-1', recolhido && 'items-center')}
        >
          {itens.map(({ href, rotulo, icone: Icone }) => {
            const ativo = itemAtivo(pathname, href);
            const quantidade = badges[href] ?? 0;
            const link = (
              <Link
                key={href}
                href={href}
                aria-current={ativo ? 'page' : undefined}
                aria-label={recolhido ? rotulo : undefined}
                className={cn(
                  'relative flex h-11 items-center rounded-full text-sm font-medium transition-colors',
                  recolhido ? 'w-11 justify-center' : 'gap-3 px-4',
                  ativo
                    ? 'bg-destaque text-destaque-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icone className="size-5 shrink-0" aria-hidden />
                {!recolhido && rotulo}
                <PendenteLink className={recolhido ? 'absolute -bottom-0.5' : undefined} />
                <BadgePendencia
                  quantidade={quantidade}
                  className={
                    recolhido
                      ? 'absolute -top-1 -right-1 min-w-4 px-1 text-[10px] leading-4'
                      : 'ml-auto'
                  }
                />
              </Link>
            );
            if (!recolhido) return link;
            return (
              <Tooltip key={href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{rotulo}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
        <div className={cn('mt-auto pt-4', recolhido ? '' : 'px-1')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={alternar}
                aria-label={RotuloBotao}
                aria-expanded={!recolhido}
                className={cn(
                  'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 flex h-11 items-center gap-3 rounded-full text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:outline-none',
                  recolhido ? 'w-11 justify-center' : 'w-full px-4',
                )}
                data-testid="alternar-menu"
              >
                <IconeBotao className="size-5 shrink-0" aria-hidden />
                {!recolhido && 'Recolher menu'}
              </button>
            </TooltipTrigger>
            {recolhido && <TooltipContent side="right">Abrir o menu</TooltipContent>}
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}

'use client';

import { Bell, ChevronDown, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROTULO_TEMA, TEMAS, temaValido, type Tema } from '@/domain/tema';
import { sair } from '@/server/actions/auth';
import { definirTema } from '@/server/actions/tema';

const ROTULO_PERFIL = { dono: 'Dono', vendedor: 'Vendedor' } as const;

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return (
    (partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

export function UserMenu({
  nome,
  email,
  perfil,
  tema: temaInicial,
}: {
  nome: string;
  email: string;
  perfil: keyof typeof ROTULO_PERFIL;
  tema: Tema;
}) {
  const [tema, setTema] = useState(temaInicial);
  const [, iniciar] = useTransition();

  function escolherTema(valor: string) {
    const novo = temaValido(valor);
    setTema(novo);
    // aplica na hora (o servidor grava o cookie e as próximas páginas já vêm no tema)
    document.querySelector('[data-painel]')?.setAttribute('data-tema', novo);
    iniciar(() => definirTema(novo));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:bg-accent focus-visible:ring-ring/50 flex h-11 items-center gap-2 rounded-full py-1 pr-3 pl-1 outline-none focus-visible:ring-[3px]"
        aria-label={`Menu do usuário ${nome}`}
      >
        <span className="bg-secondary text-secondary-foreground ring-primary grid size-9 place-items-center rounded-full text-xs font-bold ring-2">
          {iniciais(nome)}
        </span>
        <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{nome}</span>
        <ChevronDown className="text-muted-foreground hidden size-4 sm:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{nome}</p>
          <p className="text-muted-foreground truncate text-xs">{email}</p>
          <p className="text-muted-foreground mt-1 text-xs">{ROTULO_PERFIL[perfil]}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-semibold">
          Tema
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={tema} onValueChange={escolherTema}>
          {TEMAS.map((t) => (
            <DropdownMenuRadioItem key={t} value={t} className="cursor-pointer">
              {ROTULO_TEMA[t]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/conta/avisos" className="cursor-pointer">
            <Bell aria-hidden />
            Minha conta: avisos
          </Link>
        </DropdownMenuItem>
        <form action={sair}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut aria-hidden />
              Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

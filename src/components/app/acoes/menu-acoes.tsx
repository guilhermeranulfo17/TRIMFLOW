'use client';

import { MoreVertical, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type AcaoMenu = {
  rotulo: string;
  icone: LucideIcon;
  onSelecionar: () => void;
  perigosa?: boolean;
};

/** Menu secundário (⋮) de um card: duplicar, excluir… */
export function MenuAcoes({ rotulo, acoes }: { rotulo: string; acoes: AcaoMenu[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={rotulo}>
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {acoes.map((a) => (
          <DropdownMenuItem
            key={a.rotulo}
            variant={a.perigosa ? 'destructive' : 'default'}
            className="min-h-11"
            onSelect={a.onSelecionar}
          >
            <a.icone aria-hidden />
            {a.rotulo}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

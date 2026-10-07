'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Senha com o botão de mostrar/ocultar; `icone` opcional à esquerda (como no login). */
export function CampoSenha({
  icone,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'type'> & { icone?: React.ReactNode }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      {icone && <IconeCampo>{icone}</IconeCampo>}
      <Input
        {...props}
        type={visivel ? 'text' : 'password'}
        className={cn('pr-11', icone && 'pl-10', className)}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 grid w-11 place-items-center"
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {visivel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Ícone decorativo dentro do campo, à esquerda (o campo precisa de pl-10). */
export function IconeCampo({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="text-muted-foreground pointer-events-none absolute inset-y-0 left-0 grid w-10 place-items-center [&_svg]:size-4"
    >
      {children}
    </span>
  );
}

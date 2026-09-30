'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

export function CampoSenha(props: Omit<React.ComponentProps<typeof Input>, 'type'>) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visivel ? 'text' : 'password'} className="pr-11" />
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

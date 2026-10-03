'use client';

import { forcaDaSenha, ROTULO_FORCA } from '@/domain/forca-senha';
import { cn } from '@/lib/utils';

const COR = { fraca: 'bg-erro', media: 'bg-alerta', forte: 'bg-sucesso' } as const;
const TEXTO = { fraca: 'text-erro', media: 'text-alerta', forte: 'text-sucesso' } as const;
const BARRAS = { fraca: 1, media: 2, forte: 3 } as const;

/** Barra de força da senha (orientação; o mínimo que vale é o do schema). */
export function ForcaSenha({ senha }: { senha: string }) {
  if (!senha) return <p className="text-muted-foreground text-sm">Pelo menos 8 caracteres.</p>;
  const { nivel } = forcaDaSenha(senha);
  return (
    <div className="flex items-center gap-3" aria-live="polite" data-testid="forca-senha">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i <= BARRAS[nivel] ? COR[nivel] : 'bg-muted',
            )}
          />
        ))}
      </div>
      <span className={cn('text-sm font-semibold', TEXTO[nivel])}>
        Senha {ROTULO_FORCA[nivel].toLowerCase()}
        {senha.length < 8 && ' (mínimo 8)'}
      </span>
    </div>
  );
}

'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Copia um texto para a área de transferência e mostra "Copiado" por 2 s. */
export function BotaoCopiar({
  texto,
  rotulo = 'Copiar',
  rotuloAcessivel,
  className,
  aoCopiar,
}: {
  texto: string;
  rotulo?: string;
  rotuloAcessivel?: string;
  className?: string;
  aoCopiar?: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(texto);
          setCopiado(true);
          aoCopiar?.();
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          // sem permissão de área de transferência: o texto continua visível para copiar à mão
        }
      }}
      className={cn(
        'rounded-control hover:bg-accent inline-flex min-h-11 shrink-0 items-center gap-1.5 border px-3 text-sm font-semibold',
        className,
      )}
      aria-label={rotuloAcessivel}
    >
      {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copiado ? 'Copiado' : rotulo}
    </button>
  );
}

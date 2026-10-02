'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/** Link com botão de copiar. */
export function LinhaDoLink({ link, principal = false }: { link: string; principal?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="rounded-control bg-muted flex items-center gap-2 px-3 py-2 text-sm">
      <span
        className={`min-w-0 flex-1 truncate ${principal ? 'font-semibold' : ''}`}
        data-testid={principal ? 'link-principal' : undefined}
      >
        {link}
      </span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard?.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            // sem permissão de área de transferência: o link continua visível para copiar à mão
          }
        }}
        className="hover:bg-background rounded-control inline-flex min-h-10 shrink-0 items-center gap-1.5 px-2 font-semibold"
        aria-label={`Copiar ${link}`}
      >
        {copiado ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

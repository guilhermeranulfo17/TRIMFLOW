'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { marcarLinkNaBio } from '@/server/actions/onboarding';
import { cn } from '@/lib/utils';

/** "Coloquei o link na bio": item manual do checklist (só o dono sabe se fez). */
export function BotaoLinkNaBio({
  feito,
  compacto = false,
}: {
  feito: boolean;
  compacto?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [salvando, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={salvando}
      aria-pressed={feito}
      onClick={() =>
        iniciar(async () => {
          const r = await marcarLinkNaBio(!feito);
          if (r.ok) router.refresh();
          else toast.erro(r.erro);
        })
      }
      className={cn(
        'rounded-control inline-flex min-h-11 items-center gap-2 border px-3 text-sm font-semibold disabled:opacity-60',
        feito ? 'border-primary/40 bg-primary/10 text-primary' : 'hover:bg-accent',
      )}
      data-testid="fiz-link-na-bio"
    >
      <Check className="size-4" aria-hidden />
      {feito ? 'Link na bio: feito' : compacto ? 'Fiz' : 'Já coloquei o link na bio'}
    </button>
  );
}

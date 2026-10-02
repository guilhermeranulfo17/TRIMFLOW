'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { dispensarChecklist } from '@/server/actions/onboarding';

/** Minha conta: mostrar de novo (ou esconder) o checklist "Seu link está X% pronto". */
export function ReativarChecklist({ dispensado }: { dispensado: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [salvando, iniciar] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="self-start"
      disabled={salvando}
      data-testid="reativar-checklist"
      onClick={() =>
        iniciar(async () => {
          const r = await dispensarChecklist(!dispensado);
          if (r.ok) {
            toast.sucesso(r.mensagem);
            router.refresh();
          } else toast.erro(r.erro);
        })
      }
    >
      {dispensado ? 'Mostrar o checklist de novo' : 'Esconder o checklist'}
    </Button>
  );
}

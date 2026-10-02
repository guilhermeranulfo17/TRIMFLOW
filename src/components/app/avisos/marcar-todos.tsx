'use client';

import { CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { marcarAvisosLidos } from '@/server/actions/avisos';

export function MarcarTodosLidos({ desabilitado }: { desabilitado: boolean }) {
  const router = useRouter();
  const [executando, iniciar] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={desabilitado || executando}
      onClick={() =>
        iniciar(async () => {
          await marcarAvisosLidos(null);
          router.refresh();
        })
      }
    >
      <CheckCheck aria-hidden />
      Marcar todos como lidos
    </Button>
  );
}

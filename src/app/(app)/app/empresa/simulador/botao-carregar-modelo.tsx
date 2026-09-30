'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AvisoForm } from '@/components/auth/aviso-form';
import { Button } from '@/components/ui/button';
import { aplicarModeloExemplo } from '@/server/catalogo/aplicar-modelo';

export function BotaoCarregarModelo() {
  const router = useRouter();
  const [erro, setErro] = useState<string>();
  const [carregando, iniciar] = useTransition();

  return (
    <div className="space-y-3">
      {erro && <AvisoForm tipo="erro">{erro}</AvisoForm>}
      <Button
        disabled={carregando}
        onClick={() =>
          iniciar(async () => {
            const r = await aplicarModeloExemplo();
            if (r.ok) router.refresh();
            else setErro(r.erro);
          })
        }
      >
        {carregando ? 'Carregando…' : 'Carregar modelo de exemplo'}
      </Button>
    </div>
  );
}

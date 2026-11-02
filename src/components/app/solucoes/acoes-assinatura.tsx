'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { cancelarSolucao, verificarPagamentoSolucao } from '@/server/actions/modulos';

/** "Já paguei" (consulta o provedor; o retorno do checkout não comprova pagamento). */
export function VerificarPagamento({ codigo }: { codigo: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await verificarPagamentoSolucao(codigo);
          if (r.ok) toast.sucesso(r.mensagem);
          else toast.erro(r.erro);
          router.refresh();
        })
      }
      data-testid="verificar-pagamento"
    >
      {pendente && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Já paguei: verificar
    </Button>
  );
}

/** Cancelar a assinatura da solução, com confirmação e a regra explicada antes. */
export function CancelarSolucao({ codigo, nome }: { codigo: string; nome: string }) {
  const toast = useToast();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  if (!aberto) {
    return (
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => setAberto(true)}
        data-testid="cancelar-solucao"
      >
        Cancelar assinatura
      </Button>
    );
  }
  return (
    <div
      className="border-erro/30 bg-erro/5 rounded-card flex flex-col gap-3 border p-4"
      role="group"
    >
      <p className="text-sm">
        Cancelar o {nome}? Nada mais será cobrado. O acesso continua até o fim do período já pago;
        depois, o que você registrou fica disponível para consulta.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="border-erro/40 bg-erro/10 text-erro min-h-11 border"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await cancelarSolucao(codigo);
              if (r.ok) {
                toast.sucesso(r.mensagem);
                setAberto(false);
                router.refresh();
              } else toast.erro(r.erro);
            })
          }
          data-testid="confirmar-cancelamento"
        >
          {pendente && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Confirmar cancelamento
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={() => setAberto(false)}>
          Manter
        </Button>
      </div>
    </div>
  );
}

'use client';

import { Loader2, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { estornarRecebimento } from '@/server/actions/financeiro';

/** Estornar um pagamento lançado errado (continua no histórico, riscado). */
export function Estornar({
  id,
  reservaId,
  descricao,
}: {
  id: string;
  reservaId: string;
  descricao: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold"
        onClick={() => setAberto(true)}
        data-testid="estornar"
      >
        <Undo2 className="size-4" aria-hidden />
        Estornar
      </button>
      <Dialog open={aberto} onOpenChange={(v) => !pendente && setAberto(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estornar {descricao}?</DialogTitle>
            <DialogDescription>
              Use quando o pagamento foi lançado errado ou devolvido. Ele sai da conta e fica no
              histórico, riscado.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-semibold">
            Motivo (opcional)
            <input
              className="rounded-control border-input bg-background mt-1 block h-11 w-full border px-3 text-base font-normal"
              value={motivo}
              maxLength={200}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pendente}
              onClick={() => setAberto(false)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pendente}
              data-testid="confirmar-estorno"
              onClick={() =>
                iniciar(async () => {
                  const r = await estornarRecebimento(id, reservaId, motivo);
                  if (r.ok) {
                    toast.sucesso(r.mensagem);
                    setAberto(false);
                    router.refresh();
                  } else toast.erro(r.erro);
                })
              }
            >
              {pendente && <Loader2 className="animate-spin" aria-hidden />}
              Estornar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

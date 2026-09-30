'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Confirmação antes de uma ação que não pode ser desfeita (ex.: excluir). */
export function DialogoConfirmacao({
  aberto,
  onAbertoChange,
  titulo,
  descricao = 'Isso não pode ser desfeito.',
  textoConfirmar = 'Excluir',
  executando = false,
  onConfirmar,
}: {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  titulo: string;
  descricao?: string;
  textoConfirmar?: string;
  executando?: boolean;
  onConfirmar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !executando && onAbertoChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={executando}
            onClick={() => onAbertoChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={executando} onClick={onConfirmar}>
            {executando && <Loader2 className="animate-spin" aria-hidden />}
            {textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { FileSignature } from 'lucide-react';
import { ROTULO_STATUS, type StatusContrato } from '@/domain/contratos/estados';
import { cn } from '@/lib/utils';

/*
 * Selo do status do contrato (lista, detalhe, lead e Agenda). Só tokens de estado (alerta,
 * sucesso, info, erro): nada de cor fixa.
 */

const CLASSE: Record<StatusContrato, string> = {
  rascunho: 'bg-muted text-muted-foreground border-border',
  enviado: 'bg-info/10 text-info border-info/30',
  assinado_cliente: 'bg-info/10 text-info border-info/30',
  concluido: 'bg-sucesso/10 text-sucesso border-sucesso/30',
  recusado: 'bg-alerta/10 text-alerta border-alerta/30',
  expirado: 'bg-alerta/10 text-alerta border-alerta/30',
  cancelado: 'bg-muted text-muted-foreground border-border',
};

/** Texto curto para a Agenda (ao lado de "Reservado"). */
const CURTO: Record<StatusContrato, string> = {
  rascunho: 'Contrato em rascunho',
  enviado: 'Contrato enviado',
  assinado_cliente: 'Contrato assinado',
  concluido: 'Contrato assinado',
  recusado: 'Contrato: pediu ajuste',
  expirado: 'Contrato: link vencido',
  cancelado: 'Contrato cancelado',
};

export function SeloStatusContrato({
  status,
  curto = false,
  className,
}: {
  status: StatusContrato;
  /** texto com "Contrato" (Agenda e reserva) */
  curto?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        CLASSE[status],
        className,
      )}
      data-testid="selo-contrato"
      data-status={status}
    >
      {curto && <FileSignature className="size-3.5" aria-hidden />}
      {curto ? CURTO[status] : ROTULO_STATUS[status]}
    </span>
  );
}

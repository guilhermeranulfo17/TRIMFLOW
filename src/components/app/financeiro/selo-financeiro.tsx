import { ROTULO_STATUS_FINANCEIRO, type StatusFinanceiro } from '@/domain/financeiro';
import { cn } from '@/lib/utils';

/** Selo da situação financeira da festa (só tokens de estado). */
const CLASSE: Record<StatusFinanceiro, string> = {
  quitado: 'bg-sucesso/10 text-sucesso border-sucesso/30',
  em_dia: 'bg-info/10 text-info border-info/30',
  atrasado: 'bg-erro/10 text-erro border-erro/30',
  sem_plano: 'bg-muted text-muted-foreground border-border',
};

export function SeloFinanceiro({ status }: { status: StatusFinanceiro }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        CLASSE[status],
      )}
      data-testid="selo-financeiro"
      data-status={status}
    >
      {ROTULO_STATUS_FINANCEIRO[status]}
    </span>
  );
}

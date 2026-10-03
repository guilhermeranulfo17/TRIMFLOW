import { AlertTriangle, ArrowRight, Clock, Lock } from 'lucide-react';
import Link from 'next/link';
import type { FaixaConta } from '@/domain/plano';
import { cn } from '@/lib/utils';

const ICONE = { teste: Clock, inadimplente: AlertTriangle, suspenso: Lock, cancelado: Clock };

/** Faixa global da conta: teste nos últimos dias, pagamento em atraso, suspensa, cancelada. */
export function FaixaContaPainel({ faixa }: { faixa: FaixaConta }) {
  const Icone = ICONE[faixa.tipo];
  return (
    <Link
      href="/app/empresa/plano"
      data-testid="faixa-conta"
      data-tipo={faixa.tipo}
      className={cn(
        'flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium',
        faixa.tipo === 'suspenso' && 'bg-red-500/15 text-red-200',
        faixa.tipo === 'inadimplente' && 'bg-amber-400/15 text-amber-200',
        (faixa.tipo === 'teste' || faixa.tipo === 'cancelado') && 'bg-destaque/15 text-foreground',
      )}
    >
      <Icone className="size-4 shrink-0" aria-hidden />
      <span>
        {faixa.texto}{' '}
        <strong className="font-semibold underline underline-offset-2">{faixa.acao}</strong>
      </span>
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}

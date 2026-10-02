'use client';

import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { PASSOS_ONBOARDING, percentualProgresso } from '@/domain/onboarding/passos';
import { irParaPasso } from '@/server/actions/onboarding';

/** Cabeçalho do passo: barra de progresso, "Passo X de 5", título e "Sair e terminar depois". */
export function CabecalhoPasso({ passo }: { passo: number }) {
  const atual = PASSOS_ONBOARDING.find((p) => p.numero === passo)!;
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground font-semibold" data-testid="passo-onboarding">
          Passo {passo} de {PASSOS_ONBOARDING.length}
        </span>
        <Link
          href="/app/leads"
          className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center underline-offset-4 hover:underline"
        >
          Sair e terminar depois
        </Link>
      </div>
      <div
        className="bg-muted h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={percentualProgresso(passo)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso da configuração"
      >
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${percentualProgresso(passo)}%` }}
        />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight">{atual.titulo}</h1>
    </header>
  );
}

/**
 * Rodapé fixo com Voltar e Continuar. `antes` roda primeiro (salvar o passo); se devolver
 * false, não avança. O passo é sempre salvo no servidor (fechar e voltar continua daqui).
 */
export function RodapePasso({
  passo,
  rotulo = 'Continuar',
  antes,
  desabilitado,
  extra,
}: {
  passo: number;
  rotulo?: string;
  antes?: () => Promise<boolean>;
  desabilitado?: boolean;
  extra?: React.ReactNode;
}) {
  const toast = useToast();
  const router = useRouter();
  const [indo, iniciar] = useTransition();
  const ir = (destino: number, salvar: boolean) =>
    iniciar(async () => {
      if (salvar && antes && !(await antes())) return;
      const r = await irParaPasso(destino);
      if (!r.ok) {
        toast.erro(r.erro);
        return;
      }
      router.push(`/app/comecar?passo=${destino}`);
      router.refresh();
    });
  return (
    <div className="bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center gap-2">
        {passo > 1 && (
          <Button
            type="button"
            variant="outline"
            disabled={indo}
            onClick={() => ir(passo - 1, false)}
            aria-label="Voltar"
          >
            <ArrowLeft aria-hidden />
            <span className="hidden sm:inline">Voltar</span>
          </Button>
        )}
        {extra}
        <Button
          type="button"
          className="ml-auto flex-1 sm:flex-none"
          disabled={indo || desabilitado}
          onClick={() => ir(passo + 1, true)}
          data-testid="continuar-onboarding"
        >
          {indo && <Loader2 className="animate-spin" aria-hidden />}
          {rotulo}
        </Button>
      </div>
    </div>
  );
}

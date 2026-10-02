import { ArrowRight, Rocket } from 'lucide-react';
import Link from 'next/link';
import { textoProgresso } from '@/domain/onboarding/passos';

/** Faixa no topo do painel enquanto o onboarding não termina (só para o dono). */
export function FaixaOnboarding({ passo }: { passo: number }) {
  return (
    <Link
      href="/app/comecar"
      className="bg-primary text-primary-foreground flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold"
      data-testid="faixa-onboarding"
    >
      <Rocket className="size-4 shrink-0" aria-hidden />
      <span>Termine de configurar seu link ({textoProgresso(passo)})</span>
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Botão limão da landing (a mesma forma para o topo e para a chamada final). */
export const BOTAO_LANDING =
  'inline-flex min-h-14 items-center justify-between gap-4 rounded-[1.75rem] bg-[var(--ld-limao)] px-6 py-4 text-left text-base leading-tight font-bold text-[#0a0a0a] transition-[background-color,transform] hover:bg-[#cdf57a] focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none';

/** Vai ao cadastro e conta o clique (data-cta-teste, ver RastreioLanding). */
export function BotaoTeste({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href="/cadastro" data-cta-teste className={cn(BOTAO_LANDING, className)}>
      <span>{children}</span>
      <ArrowRight className="size-5 shrink-0" aria-hidden />
    </Link>
  );
}

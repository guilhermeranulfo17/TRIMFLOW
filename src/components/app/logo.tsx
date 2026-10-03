import { Simbolo } from '@/components/marca/simbolo';
import { cn } from '@/lib/utils';

/**
 * Logo do Orkestra: símbolo (anel com o ponto limão) + nome. A troca pelos SVGs oficiais fica em
 * components/marca (Etapa 9.6).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-extrabold tracking-tight', className)}>
      <Simbolo className="size-8 shrink-0" />
      <span className="text-lg">Orkestra</span>
    </span>
  );
}

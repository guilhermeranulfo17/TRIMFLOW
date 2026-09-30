import { cn } from '@/lib/utils';

/** Bolinha com o número de pendências (ex.: falta turno ou pacote com preço). */
export function BadgePendencia({
  quantidade,
  className,
}: {
  quantidade: number;
  className?: string;
}) {
  if (quantidade <= 0) return null;
  return (
    <span
      className={cn(
        'bg-destructive text-destructive-foreground inline-grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] leading-5 font-bold',
        className,
      )}
      aria-label={`${quantidade} ${quantidade === 1 ? 'pendência' : 'pendências'}`}
    >
      {quantidade}
    </span>
  );
}

import { cn } from '@/lib/utils';

/** Rótulo + controle + dica + erro, com os ids ligados para leitores de tela. */
export function Campo({
  id,
  rotulo,
  erro,
  dica,
  className,
  children,
}: {
  id: string;
  rotulo: string;
  erro?: string;
  dica?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className={cn('text-sm font-medium', erro && 'text-destructive')}>
        {rotulo}
      </label>
      {children}
      {dica && !erro && <p className="text-muted-foreground text-xs">{dica}</p>}
      {erro && (
        <p className="text-destructive text-xs" role="alert" id={`${id}-erro`}>
          {erro}
        </p>
      )}
    </div>
  );
}

/** Caixa de seleção com rótulo clicável e área de toque de 44px. */
export function CampoCheck({
  id,
  rotulo,
  dica,
  ...props
}: { id: string; rotulo: string; dica?: string } & Omit<
  React.ComponentProps<'input'>,
  'type' | 'id'
>) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm has-disabled:cursor-not-allowed"
    >
      <input id={id} type="checkbox" className="accent-primary mt-0.5 size-5 shrink-0" {...props} />
      <span>
        <span className="font-medium">{rotulo}</span>
        {dica && <span className="text-muted-foreground block text-xs">{dica}</span>}
      </span>
    </label>
  );
}

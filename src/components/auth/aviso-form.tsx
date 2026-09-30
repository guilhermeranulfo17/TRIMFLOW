import { CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AvisoForm({
  tipo,
  children,
}: {
  tipo: 'erro' | 'sucesso';
  children: React.ReactNode;
}) {
  const Icone = tipo === 'erro' ? CircleAlert : CircleCheck;
  return (
    <div
      role={tipo === 'erro' ? 'alert' : 'status'}
      data-testid="aviso-form"
      className={cn(
        'rounded-control flex items-start gap-2 border px-3 py-2.5 text-sm',
        tipo === 'erro'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-success/30 bg-success/5 text-success',
      )}
    >
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

import { Logotipo } from '@/components/marca/logotipo';
import { Simbolo } from '@/components/marca/simbolo';
import { cn } from '@/lib/utils';

/**
 * Logo do Orkestra: o logotipo (nome com o E de três barras). Onde não cabe (cabeçalho do
 * celular), `compacto` mostra só o símbolo.
 */
export function Logo({ className, compacto = false }: { className?: string; compacto?: boolean }) {
  if (compacto) {
    return (
      <span className={cn('inline-flex items-center', className)}>
        <Simbolo className="size-8 shrink-0" titulo="Orkestra" />
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center', className)}>
      <Logotipo className="h-[1.05rem] w-auto" />
    </span>
  );
}

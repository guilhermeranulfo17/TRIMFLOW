'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Move o item da posição `de` para `para` (imutável). */
export function mover<T>(itens: T[], de: number, para: number): T[] {
  if (para < 0 || para >= itens.length || de === para) return itens;
  const copia = [...itens];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item!);
  return copia;
}

/** Lista reordenável com botões subir/descer (funciona no celular, sem arrastar). */
export function ListaOrdenavel<T>({
  itens,
  chave,
  rotulo,
  onReordenar,
  disabled,
  children,
}: {
  itens: T[];
  chave: (item: T, indice: number) => string;
  rotulo: (item: T) => string;
  onReordenar: (itens: T[]) => void;
  disabled?: boolean;
  children: (item: T, indice: number) => React.ReactNode;
}) {
  return (
    <ul className="space-y-3">
      {itens.map((item, i) => (
        <li key={chave(item, i)} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{children(item, i)}</div>
          {!disabled && itens.length > 1 && (
            <div className="flex shrink-0 flex-col gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={i === 0}
                aria-label={`Subir ${rotulo(item)}`}
                onClick={() => onReordenar(mover(itens, i, i - 1))}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={i === itens.length - 1}
                aria-label={`Descer ${rotulo(item)}`}
                onClick={() => onReordenar(mover(itens, i, i + 1))}
              >
                <ArrowDown aria-hidden />
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

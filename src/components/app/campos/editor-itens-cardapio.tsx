'use client';

import { Plus, X } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Um item por linha: adiciona com Enter ou pelo botão, remove pelo X. */
export function EditorItensCardapio({
  id,
  valor,
  onChange,
  disabled,
}: {
  id: string;
  valor: string[];
  onChange: (itens: string[]) => void;
  disabled?: boolean;
}) {
  const lista = useRef<HTMLUListElement>(null);
  const focarUltimo = () =>
    requestAnimationFrame(() =>
      lista.current?.querySelector<HTMLInputElement>('li:last-child input')?.focus(),
    );

  return (
    <div className="space-y-2">
      <ul ref={lista} className="space-y-2">
        {valor.map((item, i) => (
          <li key={i} className="flex gap-2">
            <Input
              id={i === 0 ? id : `${id}-${i}`}
              aria-label={`Item ${i + 1}`}
              value={item}
              disabled={disabled}
              onChange={(e) => onChange(valor.map((v, j) => (j === i ? e.target.value : v)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onChange([...valor.slice(0, i + 1), '', ...valor.slice(i + 1)]);
                  focarUltimo();
                }
              }}
            />
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover ${item || `item ${i + 1}`}`}
                onClick={() => onChange(valor.filter((_, j) => j !== i))}
              >
                <X aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onChange([...valor, '']);
            focarUltimo();
          }}
        >
          <Plus aria-hidden /> Adicionar item
        </Button>
      )}
    </div>
  );
}

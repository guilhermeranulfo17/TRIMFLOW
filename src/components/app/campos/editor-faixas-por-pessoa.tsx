'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { Campo } from '@/components/app/form/campo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CampoDinheiro } from './campo-dinheiro';

export type FaixaPorPessoa = { ateConvidados: number; valorCentavos: number };

/**
 * Faixas de preço por pessoa (§96): "até 90 convidados, R$ 45,00 por pessoa". Controlado: o
 * formulário guarda a lista (Controller) e passa os erros por caminho ("0.ateConvidados").
 */
export function EditorFaixasPorPessoa({
  id,
  valor,
  onChange,
  erro,
  rotuloValor = 'Valor por pessoa',
}: {
  id: string;
  valor: FaixaPorPessoa[];
  onChange: (faixas: FaixaPorPessoa[]) => void;
  erro?: (caminho: string) => string | undefined;
  rotuloValor?: string;
}) {
  // chave estável por linha: remover uma faixa não pode levar o texto do campo para a vizinha
  const proxima = useRef(0);
  const chaves = useRef<number[]>([]);
  while (chaves.current.length < valor.length) chaves.current.push(proxima.current++);
  if (chaves.current.length > valor.length) chaves.current.length = valor.length;

  const trocar = (i: number, parcial: Partial<FaixaPorPessoa>) =>
    onChange(valor.map((f, j) => (j === i ? { ...f, ...parcial } : f)));

  return (
    <div className="space-y-3">
      {valor.length > 0 && (
        <ul className="space-y-2">
          {valor.map((f, i) => (
            <li key={chaves.current[i]} className="flex items-start gap-2">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                <Campo
                  id={`${id}-ate-${i}`}
                  rotulo={`Faixa ${i + 1}: até (convidados)`}
                  erro={erro?.(`${i}.ateConvidados`)}
                >
                  <Input
                    id={`${id}-ate-${i}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={Number.isFinite(f.ateConvidados) ? f.ateConvidados : ''}
                    onChange={(e) => trocar(i, { ateConvidados: e.target.valueAsNumber })}
                  />
                </Campo>
                <Campo
                  id={`${id}-valor-${i}`}
                  rotulo={`Faixa ${i + 1}: ${rotuloValor.toLowerCase()}`}
                  erro={erro?.(`${i}.valorCentavos`)}
                >
                  <CampoDinheiro
                    id={`${id}-valor-${i}`}
                    valor={Number.isFinite(f.valorCentavos) ? f.valorCentavos : null}
                    onChange={(v) => trocar(i, { valorCentavos: v ?? Number.NaN })}
                  />
                </Campo>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-6"
                aria-label={`Remover faixa ${i + 1}`}
                onClick={() => {
                  chaves.current.splice(i, 1);
                  onChange(valor.filter((_, j) => j !== i));
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const ultima = valor.at(-1)?.ateConvidados;
          onChange([
            ...valor,
            {
              ateConvidados: Number.isFinite(ultima) ? (ultima as number) + 30 : 60,
              valorCentavos: Number.NaN,
            },
          ]);
        }}
      >
        <Plus aria-hidden /> Adicionar faixa
      </Button>
    </div>
  );
}

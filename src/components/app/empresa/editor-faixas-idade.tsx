'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Controller, useFieldArray, type UseFormReturn } from 'react-hook-form';
import { CampoPercentual } from '@/components/app/campos';
import { Campo } from '@/components/app/form/campo';
import { lerErro } from '@/components/app/form/erros';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FaixasIdadePacoteEntrada } from '@/domain/validacao/catalogo';

const numeroOuNulo = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));

/**
 * Faixas de idade das crianças (quem não paga, quem paga meia…). Usado na política da empresa
 * (Preços e regras) e na política própria de um pacote.
 */
export function EditorFaixasIdade({
  form,
  prefixoId,
}: {
  form: UseFormReturn<FaixasIdadePacoteEntrada>;
  prefixoId: string;
}) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'faixas' });
  const erros = form.formState.errors;
  const faixas = form.watch('faixas');

  return (
    <div className="space-y-3">
      {lerErro(erros, 'faixas') && (
        <p className="text-destructive text-sm" role="alert">
          {lerErro(erros, 'faixas')}
        </p>
      )}
      <ul className="space-y-3">
        {fields.map((campo, i) => {
          const id = `${prefixoId}-faixa-${i}`;
          return (
            <li key={campo.id} className="rounded-card space-y-3 border p-3">
              <div className="flex items-start gap-2">
                <Campo
                  id={`${id}-rotulo`}
                  rotulo={`Nome da faixa ${i + 1}`}
                  erro={lerErro(erros, `faixas.${i}.rotulo`)}
                  className="flex-1"
                >
                  <Input
                    id={`${id}-rotulo`}
                    placeholder="Ex.: Crianças de 6 a 10 anos"
                    {...form.register(`faixas.${i}.rotulo`)}
                  />
                </Campo>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6"
                  aria-label={`Remover faixa ${i + 1}`}
                  onClick={() => remove(i)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Campo
                  id={`${id}-min`}
                  rotulo="De (anos)"
                  erro={lerErro(erros, `faixas.${i}.idadeMin`)}
                >
                  <Input
                    id={`${id}-min`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    {...form.register(`faixas.${i}.idadeMin`, { valueAsNumber: true })}
                  />
                </Campo>
                <Campo
                  id={`${id}-max`}
                  rotulo="Até (anos)"
                  dica="Vazio = ou mais"
                  erro={lerErro(erros, `faixas.${i}.idadeMax`)}
                >
                  <Input
                    id={`${id}-max`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    {...form.register(`faixas.${i}.idadeMax`, { setValueAs: numeroOuNulo })}
                  />
                </Campo>
                <Campo
                  id={`${id}-fator`}
                  rotulo="Paga (%)"
                  dica="0% = não paga"
                  erro={lerErro(erros, `faixas.${i}.fatorBp`)}
                  className="col-span-2 sm:col-span-1"
                >
                  <Controller
                    control={form.control}
                    name={`faixas.${i}.fatorBp`}
                    render={({ field }) => (
                      <CampoPercentual
                        id={`${id}-fator`}
                        valor={field.value}
                        onChange={(v) => field.onChange(v ?? Number.NaN)}
                        invalido={!!lerErro(erros, `faixas.${i}.fatorBp`)}
                      />
                    )}
                  />
                </Campo>
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const ultima = faixas.at(-1);
          const inicio = ultima ? (ultima.idadeMax ?? ultima.idadeMin) + 1 : 0;
          append({ rotulo: '', idadeMin: inicio, idadeMax: null, fatorBp: 5000 });
        }}
      >
        <Plus aria-hidden /> Adicionar faixa
      </Button>
    </div>
  );
}

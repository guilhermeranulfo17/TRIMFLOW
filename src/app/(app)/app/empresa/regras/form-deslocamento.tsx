'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useTransition } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { CampoDinheiro } from '@/components/app/campos';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor, lerErro } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { deslocamentoSchema, type DeslocamentoEntrada } from '@/domain/validacao/regras';
import { salvarDeslocamento } from '@/server/actions/empresa/regras';

const MODELOS = [
  { valor: 'nenhum', titulo: 'Não cobro deslocamento' },
  { valor: 'por_km', titulo: 'Por km rodado' },
  { valor: 'por_faixa', titulo: 'Por faixa de distância' },
] as const;

export function FormDeslocamento({
  inicial,
  somenteLeitura,
}: {
  inicial: DeslocamentoEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<DeslocamentoEntrada>({
    resolver: zodResolver(deslocamentoSchema),
    defaultValues: inicial,
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'faixas' });
  const e = form.formState.errors;
  const modelo = form.watch('modelo');
  const faixas = form.watch('faixas');

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const entrada = { ...valores, faixas: valores.modelo === 'por_faixa' ? valores.faixas : [] };
      const r = await salvarDeslocamento(entrada);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(entrada);
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <Secao
      id="deslocamento"
      titulo="Deslocamento"
      descricao="Cobrado só em espaços marcados como “no local do cliente” (buffet em domicílio)."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Como cobrar</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODELOS.map((m) => (
            <label
              key={m.valor}
              className={cn(
                'rounded-card flex min-h-11 cursor-pointer items-center gap-3 border p-3 text-sm',
                modelo === m.valor && 'border-primary bg-accent/50',
              )}
            >
              <input
                type="radio"
                value={m.valor}
                className="accent-primary size-5 shrink-0"
                {...form.register('modelo')}
              />
              {m.titulo}
            </label>
          ))}
        </div>
      </fieldset>
      {modelo === 'por_km' && (
        <div className="grid grid-cols-2 gap-3">
          <Campo id="desl-km-gratis" rotulo="Km grátis" erro={e.kmGratis?.message}>
            <Input
              id="desl-km-gratis"
              type="number"
              inputMode="numeric"
              min={0}
              {...form.register('kmGratis', { valueAsNumber: true })}
            />
          </Campo>
          <Campo id="desl-valor-km" rotulo="Valor por km" erro={e.valorKmCentavos?.message}>
            <Controller
              control={form.control}
              name="valorKmCentavos"
              render={({ field }) => (
                <CampoDinheiro
                  id="desl-valor-km"
                  valor={field.value}
                  onChange={(v) => field.onChange(v ?? Number.NaN)}
                />
              )}
            />
          </Campo>
        </div>
      )}
      {modelo === 'por_faixa' && (
        <div className="space-y-3">
          {lerErro(e, 'faixas') && (
            <p className="text-destructive text-sm" role="alert">
              {lerErro(e, 'faixas')}
            </p>
          )}
          <ul className="space-y-2">
            {fields.map((campo, i) => (
              <li key={campo.id} className="flex items-start gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                  <Campo
                    id={`desl-ate-${i}`}
                    rotulo={`Faixa ${i + 1}: até (km)`}
                    erro={lerErro(e, `faixas.${i}.ateKm`)}
                  >
                    <Input
                      id={`desl-ate-${i}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      {...form.register(`faixas.${i}.ateKm`, { valueAsNumber: true })}
                    />
                  </Campo>
                  <Campo
                    id={`desl-valor-${i}`}
                    rotulo={`Faixa ${i + 1}: valor`}
                    erro={lerErro(e, `faixas.${i}.valorCentavos`)}
                  >
                    <Controller
                      control={form.control}
                      name={`faixas.${i}.valorCentavos`}
                      render={({ field }) => (
                        <CampoDinheiro
                          id={`desl-valor-${i}`}
                          valor={field.value}
                          onChange={(v) => field.onChange(v ?? Number.NaN)}
                        />
                      )}
                    />
                  </Campo>
                </div>
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
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const ultima = faixas.at(-1)?.ateKm;
              append({
                ateKm: Number.isFinite(ultima) ? (ultima as number) + 10 : 10,
                valorCentavos: Number.NaN,
              });
            }}
          >
            <Plus aria-hidden /> Adicionar faixa
          </Button>
          <p className="text-muted-foreground text-xs">
            Acima da maior faixa, o cliente não consegue pedir orçamento pelo link.
          </p>
        </div>
      )}
    </Secao>
  );
}

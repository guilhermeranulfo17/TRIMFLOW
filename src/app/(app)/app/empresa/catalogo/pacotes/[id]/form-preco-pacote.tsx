'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { CampoDinheiro, CampoDuracao } from '@/components/app/campos';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor, lerErro } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { precoPacoteSchema, type PrecoPacoteEntrada } from '@/domain/validacao/catalogo';
import { salvarPrecoPacote } from '@/server/actions/empresa/pacotes';

const numeroOuNulo = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));

const MODELOS = [
  {
    valor: 'por_pessoa',
    titulo: 'Por convidado',
    texto: 'Um valor para cada convidado. Ex.: R$ 89,90 por pessoa.',
  },
  {
    valor: 'por_faixa',
    titulo: 'Por faixa de convidados',
    texto: 'Um valor fechado por faixa. Ex.: até 50 convidados, R$ 3.500.',
  },
] as const;

export function FormPrecoPacote({
  pacoteId,
  inicial,
  somenteLeitura,
}: {
  pacoteId: string;
  inicial: PrecoPacoteEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [salvando, iniciar] = useTransition();
  const form = useForm<PrecoPacoteEntrada>({
    resolver: zodResolver(precoPacoteSchema),
    defaultValues: inicial,
  });
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'faixas',
  });
  const e = form.formState.errors;
  const modelo = form.watch('modeloPreco');
  const faixas = form.watch('faixas');

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarPrecoPacote(pacoteId, valores);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(valores);
        router.refresh();
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <Secao
      id="preco"
      titulo="Preço"
      descricao="Como o pacote é cobrado, quantos convidados aceita e quanto tempo dura."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Como o pacote é cobrado</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODELOS.map((m) => (
            <label
              key={m.valor}
              className={cn(
                'rounded-card flex min-h-11 cursor-pointer gap-3 border p-3 text-sm',
                modelo === m.valor && 'border-primary bg-accent/50',
              )}
            >
              <input
                type="radio"
                value={m.valor}
                className="accent-primary mt-0.5 size-5 shrink-0"
                {...form.register('modeloPreco', {
                  // Faixas só valem no modelo por faixa: some com elas no outro modelo (e o
                  // formulário não fica preso em erros escondidos).
                  onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
                    if (ev.target.value === 'por_pessoa') replace([]);
                    else if (form.getValues('faixas').length === 0)
                      replace([{ ateConvidados: 50, valorCentavos: Number.NaN }]);
                  },
                })}
              />
              <span>
                <span className="block font-medium">{m.titulo}</span>
                <span className="text-muted-foreground text-xs">{m.texto}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {modelo === 'por_pessoa' ? (
        <Campo id="preco-pessoa" rotulo="Preço por convidado" erro={e.precoPessoaCentavos?.message}>
          <Controller
            control={form.control}
            name="precoPessoaCentavos"
            render={({ field }) => (
              <CampoDinheiro
                id="preco-pessoa"
                valor={field.value}
                onChange={field.onChange}
                invalido={!!e.precoPessoaCentavos}
                className="w-40"
              />
            )}
          />
        </Campo>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium">Faixas de convidados</p>
          {lerErro(e, 'faixas') && (
            <p className="text-destructive text-sm" role="alert">
              {lerErro(e, 'faixas')}
            </p>
          )}
          <ul className="space-y-2">
            {fields.map((campo, i) => (
              <li key={campo.id} className="rounded-card flex items-start gap-2 border p-3">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
                  <Campo
                    id={`faixa-ate-${i}`}
                    rotulo={`Faixa ${i + 1}: até (convidados)`}
                    erro={lerErro(e, `faixas.${i}.ateConvidados`)}
                  >
                    <Input
                      id={`faixa-ate-${i}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      {...form.register(`faixas.${i}.ateConvidados`, { valueAsNumber: true })}
                    />
                  </Campo>
                  <Campo
                    id={`faixa-valor-${i}`}
                    rotulo={`Faixa ${i + 1}: valor`}
                    erro={lerErro(e, `faixas.${i}.valorCentavos`)}
                  >
                    <Controller
                      control={form.control}
                      name={`faixas.${i}.valorCentavos`}
                      render={({ field }) => (
                        <CampoDinheiro
                          id={`faixa-valor-${i}`}
                          valor={field.value}
                          onChange={(v) => field.onChange(v ?? Number.NaN)}
                          invalido={!!lerErro(e, `faixas.${i}.valorCentavos`)}
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
              const ultima = faixas.at(-1)?.ateConvidados;
              append({
                ateConvidados: Number.isFinite(ultima) ? (ultima as number) + 20 : 50,
                valorCentavos: Number.NaN,
              });
            }}
          >
            <Plus aria-hidden /> Adicionar faixa
          </Button>
          <Campo
            id="preco-excedente"
            rotulo="Cada convidado acima da maior faixa"
            erro={e.valorExcedenteCentavos?.message}
          >
            <Controller
              control={form.control}
              name="valorExcedenteCentavos"
              render={({ field }) => (
                <CampoDinheiro
                  id="preco-excedente"
                  valor={field.value}
                  onChange={field.onChange}
                  invalido={!!e.valorExcedenteCentavos}
                  className="w-40"
                />
              )}
            />
          </Campo>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo id="preco-min" rotulo="Mínimo de convidados" erro={e.minConvidados?.message}>
          <Input
            id="preco-min"
            type="number"
            inputMode="numeric"
            min={1}
            {...form.register('minConvidados', { valueAsNumber: true })}
          />
        </Campo>
        <Campo
          id="preco-max"
          rotulo="Máximo de convidados"
          dica="Vazio = sem limite"
          erro={e.maxConvidados?.message}
        >
          <Input
            id="preco-max"
            type="number"
            inputMode="numeric"
            min={1}
            {...form.register('maxConvidados', { setValueAs: numeroOuNulo })}
          />
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="preco-duracao" rotulo="Duração da festa" erro={e.duracaoInclusaMin?.message}>
          <Controller
            control={form.control}
            name="duracaoInclusaMin"
            render={({ field }) => (
              <CampoDuracao id="preco-duracao" valor={field.value} onChange={field.onChange} />
            )}
          />
        </Campo>
        <Campo
          id="preco-hora-extra"
          rotulo="Valor da hora extra"
          dica="R$ 0,00 = não vende hora extra"
          erro={e.valorHoraExtraCentavos?.message}
        >
          <Controller
            control={form.control}
            name="valorHoraExtraCentavos"
            render={({ field }) => (
              <CampoDinheiro
                id="preco-hora-extra"
                valor={field.value}
                onChange={(v) => field.onChange(v ?? Number.NaN)}
                className="w-40"
              />
            )}
          />
        </Campo>
      </div>
    </Secao>
  );
}

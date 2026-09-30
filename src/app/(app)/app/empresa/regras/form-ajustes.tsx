'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTransition } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { CampoPercentual } from '@/components/app/campos';
import { Campo } from '@/components/app/form/campo';
import { lerErro } from '@/components/app/form/erros';
import { classeCampo } from '@/components/app/form/estilos';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { ROTULOS_DIAS } from '@/domain/conversao';
import { ajustesDiaSchema, type AjustesDiaEntrada } from '@/domain/validacao/regras';
import { salvarAjustesDia } from '@/server/actions/empresa/regras';

/** Linha na tela: "quando" é o dia (0–6) ou "feriado"; turno vazio = todos os turnos. */
type Linha = { quando: string; turnoId: string; ajusteBp: number };
type Form = { linhas: Linha[] };

function paraLinhas(ajustes: AjustesDiaEntrada['ajustes']): Linha[] {
  return ajustes.map((a) => ({
    quando: a.tipo === 'feriado' ? 'feriado' : String(a.diaSemana),
    turnoId: a.turnoId ?? '',
    ajusteBp: a.ajusteBp,
  }));
}

function paraEntrada(linhas: Linha[]): AjustesDiaEntrada {
  return {
    ajustes: linhas.map((l) => ({
      tipo: l.quando === 'feriado' ? 'feriado' : 'dia_semana',
      diaSemana: l.quando === 'feriado' ? null : Number(l.quando),
      turnoId: l.turnoId || null,
      ajusteBp: l.ajusteBp,
    })),
  };
}

export function FormAjustes({
  ajustes,
  turnos,
  somenteLeitura,
}: {
  ajustes: AjustesDiaEntrada['ajustes'];
  turnos: { id: string; nome: string }[];
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<Form>({ defaultValues: { linhas: paraLinhas(ajustes) } });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'linhas' });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      form.clearErrors();
      const entrada = paraEntrada(valores.linhas);
      const v = ajustesDiaSchema.safeParse(entrada);
      const erros = v.success ? [] : v.error.issues;
      if (erros.length === 0) {
        const r = await salvarAjustesDia(entrada);
        if (r.ok) {
          toast.sucesso(r.mensagem);
          form.reset(valores);
          return;
        }
        toast.erro(r.erro);
        return;
      }
      for (const issue of erros) {
        const [, i, campo] = issue.path;
        const destino = campo === 'ajusteBp' ? 'ajusteBp' : 'quando';
        form.setError(`linhas.${Number(i)}.${destino}`, { message: issue.message });
      }
      toast.erro('Confira os campos destacados.');
    }),
  );

  return (
    <Secao
      id="ajustes"
      titulo="Ajustes por dia"
      descricao="Aumente ou reduza o preço conforme o dia (ex.: sábado +10%, segunda −15%). Um ajuste de turno vale mais que o do dia inteiro; o de feriado vale mais que o do dia da semana."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      {fields.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhum ajuste: o preço é o mesmo em todos os dias.
        </p>
      )}
      <ul className="space-y-3">
        {fields.map((campo, i) => (
          <li key={campo.id} className="rounded-card flex items-start gap-2 border p-3">
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
              <Campo
                id={`ajuste-quando-${i}`}
                rotulo={`Ajuste ${i + 1}: quando`}
                erro={lerErro(e, `linhas.${i}.quando`)}
              >
                <select
                  id={`ajuste-quando-${i}`}
                  className={classeCampo}
                  {...form.register(`linhas.${i}.quando`)}
                >
                  {ROTULOS_DIAS.map((dia, n) => (
                    <option key={dia} value={String(n)}>
                      {dia}
                    </option>
                  ))}
                  <option value="feriado">Feriado</option>
                </select>
              </Campo>
              <Campo id={`ajuste-turno-${i}`} rotulo="Turno">
                <select
                  id={`ajuste-turno-${i}`}
                  className={classeCampo}
                  {...form.register(`linhas.${i}.turnoId`)}
                >
                  <option value="">Todos os turnos</option>
                  {turnos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo
                id={`ajuste-valor-${i}`}
                rotulo="Ajuste (%)"
                dica="Use − para desconto"
                erro={lerErro(e, `linhas.${i}.ajusteBp`)}
              >
                <Controller
                  control={form.control}
                  name={`linhas.${i}.ajusteBp`}
                  render={({ field }) => (
                    <CampoPercentual
                      id={`ajuste-valor-${i}`}
                      permitirNegativo
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
              aria-label={`Remover ajuste ${i + 1}`}
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
        onClick={() => append({ quando: '6', turnoId: '', ajusteBp: 1000 })}
      >
        <Plus aria-hidden /> Adicionar ajuste
      </Button>
    </Secao>
  );
}

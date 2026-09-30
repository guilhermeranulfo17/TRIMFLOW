'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useTransition } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor, lerErro } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { feriadosSchema, type FeriadosEntrada } from '@/domain/validacao/regras';
import { salvarFeriados } from '@/server/actions/empresa/regras';

export function FormFeriados({
  inicial,
  somenteLeitura,
}: {
  inicial: FeriadosEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<FeriadosEntrada>({
    resolver: zodResolver(feriadosSchema),
    defaultValues: inicial,
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'feriados' });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarFeriados(valores);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(valores);
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <Secao
      id="feriados"
      titulo="Feriados"
      descricao="Datas em que vale o ajuste de feriado (cadastre o ajuste em Ajustes por dia)."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      {fields.length === 0 && (
        <p className="text-muted-foreground text-sm">Nenhum feriado cadastrado.</p>
      )}
      <ul className="space-y-2">
        {fields.map((campo, i) => (
          <li key={campo.id} className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-[9.5rem_1fr] gap-2">
              <Campo
                id={`feriado-data-${i}`}
                rotulo={`Data do feriado ${i + 1}`}
                erro={lerErro(e, `feriados.${i}.data`)}
              >
                <Input
                  id={`feriado-data-${i}`}
                  type="date"
                  {...form.register(`feriados.${i}.data`)}
                />
              </Campo>
              <Campo id={`feriado-nome-${i}`} rotulo="Nome" erro={lerErro(e, `feriados.${i}.nome`)}>
                <Input
                  id={`feriado-nome-${i}`}
                  placeholder="Ex.: Natal"
                  {...form.register(`feriados.${i}.nome`)}
                />
              </Campo>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-6"
              aria-label={`Remover feriado ${i + 1}`}
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
        onClick={() => append({ data: '', nome: '' })}
      >
        <Plus aria-hidden /> Adicionar feriado
      </Button>
    </Secao>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { CampoDuracao, SeletorDiasSemana } from '@/components/app/campos';
import { Campo, CampoCheck } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { FormInline } from '@/components/app/form/form-inline';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { turnoSchema, type TurnoEntrada } from '@/domain/validacao/catalogo';
import { salvarTurno } from '@/server/actions/empresa/agenda-config';

export type TurnoItem = TurnoEntrada & { id: string; ativo: boolean };

export function FormTurno({
  turno,
  somenteLeitura,
  onFechar,
}: {
  turno: TurnoItem | null;
  somenteLeitura: boolean;
  onFechar: () => void;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<TurnoEntrada>({
    resolver: zodResolver(turnoSchema),
    defaultValues: turno ?? {
      nome: '',
      horaInicio: '',
      duracaoMin: 240,
      diasSemana: [],
      ativo: true,
    },
  });
  const e = form.formState.errors;
  const p = turno?.id ?? 'novo';

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarTurno(turno?.id ?? null, valores);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(valores);
        onFechar();
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <FormInline
      onSubmit={onSubmit}
      onCancelar={onFechar}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <Campo id={`turno-nome-${p}`} rotulo="Nome do turno" erro={e.nome?.message}>
        <Input
          id={`turno-nome-${p}`}
          placeholder="Ex.: Tarde"
          aria-invalid={!!e.nome || undefined}
          {...form.register('nome')}
        />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id={`turno-inicio-${p}`} rotulo="Começa às" erro={e.horaInicio?.message}>
          <Input
            id={`turno-inicio-${p}`}
            type="time"
            className="w-36"
            aria-invalid={!!e.horaInicio || undefined}
            {...form.register('horaInicio')}
          />
        </Campo>
        <Campo id={`turno-duracao-${p}`} rotulo="Duração" erro={e.duracaoMin?.message}>
          <Controller
            control={form.control}
            name="duracaoMin"
            render={({ field }) => (
              <CampoDuracao
                id={`turno-duracao-${p}`}
                valor={field.value}
                onChange={field.onChange}
                invalido={!!e.duracaoMin}
              />
            )}
          />
        </Campo>
      </div>
      <Campo id={`turno-dias-${p}`} rotulo="Dias da semana" erro={e.diasSemana?.message}>
        <Controller
          control={form.control}
          name="diasSemana"
          render={({ field }) => (
            <SeletorDiasSemana
              id={`turno-dias-${p}`}
              valor={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </Campo>
      <CampoCheck
        id={`turno-ativo-${p}`}
        rotulo="Ativo"
        dica="Turno inativo não pode ser escolhido pelo cliente."
        {...form.register('ativo')}
      />
    </FormInline>
  );
}

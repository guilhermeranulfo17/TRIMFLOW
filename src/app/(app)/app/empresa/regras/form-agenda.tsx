'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { CampoDuracao } from '@/components/app/campos';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { agendaRegrasSchema, type AgendaRegrasEntrada } from '@/domain/validacao/regras';
import { salvarAgendaRegras } from '@/server/actions/empresa/regras';

export function FormAgenda({
  inicial,
  somenteLeitura,
}: {
  inicial: AgendaRegrasEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<AgendaRegrasEntrada>({
    resolver: zodResolver(agendaRegrasSchema),
    defaultValues: inicial,
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarAgendaRegras(valores);
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
      id="agenda"
      titulo="Agenda"
      descricao="Tempo de limpeza e montagem depois de cada evento. Dois eventos no mesmo espaço precisam desse intervalo entre eles."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <Campo
        id="agenda-intervalo"
        rotulo="Intervalo entre eventos"
        dica="Vale para novas reservas. 0 = eventos podem ser colados."
        erro={e.intervaloEntreEventosMin?.message}
      >
        <Controller
          control={form.control}
          name="intervaloEntreEventosMin"
          render={({ field }) => (
            <CampoDuracao id="agenda-intervalo" valor={field.value} onChange={field.onChange} />
          )}
        />
      </Campo>
    </Secao>
  );
}

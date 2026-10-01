'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { mascaraCnpj } from '@/domain/validacao/cnpj';
import { dadosPropostaSchema, type DadosPropostaEntrada } from '@/domain/validacao/empresa';
import { salvarDadosProposta } from '@/server/actions/empresa/identidade';

/** Razão social, CNPJ e endereço do rodapé da proposta. */
export function FormDadosProposta({
  inicial,
  somenteLeitura,
}: {
  inicial: DadosPropostaEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<DadosPropostaEntrada>({
    resolver: zodResolver(dadosPropostaSchema),
    defaultValues: inicial,
  });
  const { register, formState, control } = form;
  const e = formState.errors;

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarDadosProposta(valores);
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
      titulo="Dados da proposta"
      descricao="Aparecem no rodapé da proposta e do PDF. Todos são opcionais."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <Campo id="razao-social" rotulo="Razão social" erro={e.razaoSocial?.message}>
        <Input
          id="razao-social"
          maxLength={160}
          aria-invalid={!!e.razaoSocial || undefined}
          {...register('razaoSocial')}
        />
      </Campo>
      <Campo id="cnpj" rotulo="CNPJ" erro={e.cnpj?.message}>
        <Controller
          control={control}
          name="cnpj"
          render={({ field }) => (
            <Input
              id="cnpj"
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
              aria-invalid={!!e.cnpj || undefined}
              value={mascaraCnpj(field.value ?? '')}
              onChange={(ev) => field.onChange(mascaraCnpj(ev.target.value))}
              onBlur={field.onBlur}
            />
          )}
        />
      </Campo>
      <Campo id="endereco" rotulo="Endereço" erro={e.endereco?.message}>
        <Input
          id="endereco"
          maxLength={200}
          placeholder="Rua, número, bairro, cidade"
          aria-invalid={!!e.endereco || undefined}
          {...register('endereco')}
        />
      </Campo>
    </Secao>
  );
}

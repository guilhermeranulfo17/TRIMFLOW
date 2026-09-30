'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { EditorFaixasIdade } from '@/components/app/empresa/editor-faixas-idade';
import { CampoCheck } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import {
  faixasIdadePacoteSchema,
  type FaixasIdadePacoteEntrada,
} from '@/domain/validacao/catalogo';
import { salvarFaixasIdadePacote } from '@/server/actions/empresa/pacotes';

export function FormCriancas({
  pacoteId,
  inicial,
  faixasEmpresa,
  somenteLeitura,
}: {
  pacoteId: string;
  inicial: FaixasIdadePacoteEntrada;
  /** Ponto de partida quando o dono liga a política própria. */
  faixasEmpresa: FaixasIdadePacoteEntrada['faixas'];
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<FaixasIdadePacoteEntrada>({
    resolver: zodResolver(faixasIdadePacoteSchema),
    defaultValues: inicial,
  });
  const propria = form.watch('propria');

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarFaixasIdadePacote(pacoteId, valores);
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
      id="criancas"
      titulo="Crianças neste pacote"
      descricao="Por padrão, o pacote segue a política de crianças da empresa (Preços e regras)."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <CampoCheck
        id="criancas-propria"
        rotulo="Usar uma política própria neste pacote"
        {...form.register('propria', {
          onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
            if (ev.target.checked && form.getValues('faixas').length === 0)
              form.setValue('faixas', faixasEmpresa, { shouldDirty: true });
          },
        })}
      />
      {propria && <EditorFaixasIdade form={form} prefixoId="pacote" />}
    </Secao>
  );
}

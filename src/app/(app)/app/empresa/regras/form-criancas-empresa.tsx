'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { EditorFaixasIdade } from '@/components/app/empresa/editor-faixas-idade';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { faixasIdadeSchema, type FaixasIdadePacoteEntrada } from '@/domain/validacao/catalogo';
import { salvarFaixasIdadeEmpresa } from '@/server/actions/empresa/regras';

export function FormCriancasEmpresa({
  inicial,
  somenteLeitura,
}: {
  inicial: FaixasIdadePacoteEntrada['faixas'];
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  // Mesmo editor da política do pacote; aqui a lista pode ficar vazia (todos pagam como adulto).
  const form = useForm<FaixasIdadePacoteEntrada>({
    resolver: zodResolver(faixasIdadeSchema) as unknown as Resolver<FaixasIdadePacoteEntrada>,
    defaultValues: { propria: false, faixas: inicial },
  });

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarFaixasIdadeEmpresa({ faixas: valores.faixas });
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
      titulo="Crianças"
      descricao="Quanto cada idade paga em relação a um adulto. Quem não está em nenhuma faixa paga como adulto. Vale para todos os pacotes, menos os que têm política própria."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <EditorFaixasIdade form={form} prefixoId="empresa" />
    </Secao>
  );
}

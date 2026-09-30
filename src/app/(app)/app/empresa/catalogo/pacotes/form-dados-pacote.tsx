'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Campo, CampoCheck } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { dadosPacoteSchema, type DadosPacoteEntrada } from '@/domain/validacao/catalogo';
import { criarPacote, salvarDadosPacote } from '@/server/actions/empresa/pacotes';

/** Dados do pacote. Sem `pacoteId`, cria o pacote e abre o editor completo. */
export function FormDadosPacote({
  pacoteId,
  inicial,
  somenteLeitura,
}: {
  pacoteId: string | null;
  inicial: DadosPacoteEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [salvando, iniciar] = useTransition();
  const form = useForm<DadosPacoteEntrada>({
    resolver: zodResolver(dadosPacoteSchema),
    defaultValues: inicial,
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      if (pacoteId === null) {
        const r = await criarPacote(valores);
        if (r.ok && r.dados) {
          toast.sucesso(r.mensagem);
          form.reset(valores);
          router.push(`/app/empresa/catalogo/pacotes/${r.dados.id}#preco`);
        } else if (!r.ok) {
          toast.erro(r.erro);
          aplicarErrosServidor(form.setError, r.campos);
        }
        return;
      }
      const r = await salvarDadosPacote(pacoteId, valores);
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
      id="dados"
      titulo="Dados do pacote"
      descricao="Nome e descrição que o cliente vê."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
      textoBotao={pacoteId ? 'Salvar' : 'Criar pacote'}
    >
      <Campo id="pacote-nome" rotulo="Nome do pacote" erro={e.nome?.message}>
        <Input
          id="pacote-nome"
          placeholder="Ex.: Super"
          aria-invalid={!!e.nome || undefined}
          {...form.register('nome')}
        />
      </Campo>
      <Campo
        id="pacote-subtitulo"
        rotulo="Subtítulo (opcional)"
        erro={e.subtitulo?.message}
        dica="Uma frase curta. Ex.: O mais escolhido para festas de até 80 convidados."
      >
        <Input id="pacote-subtitulo" {...form.register('subtitulo')} />
      </Campo>
      <Campo id="pacote-descricao" rotulo="Descrição (opcional)" erro={e.descricao?.message}>
        <Textarea id="pacote-descricao" rows={4} {...form.register('descricao')} />
      </Campo>
      <CampoCheck
        id="pacote-destaque"
        rotulo="Destacar este pacote"
        dica="Aparece com selo de destaque para o cliente."
        {...form.register('destaque')}
      />
      <CampoCheck
        id="pacote-ativo"
        rotulo="Ativo"
        dica="Pacote inativo não aparece para o cliente."
        {...form.register('ativo')}
      />
    </Secao>
  );
}

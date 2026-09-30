'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useTransition } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { EditorItensCardapio } from '@/components/app/campos';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor, lerErro } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cardapioSchema, type CardapioEntrada } from '@/domain/validacao/catalogo';
import { salvarCardapio } from '@/server/actions/empresa/pacotes';

export function FormCardapio({
  pacoteId,
  inicial,
  somenteLeitura,
}: {
  pacoteId: string;
  inicial: CardapioEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<CardapioEntrada>({ defaultValues: inicial });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'secoes' });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      // Linhas em branco (Enter a mais) não contam como item.
      const limpo = {
        secoes: valores.secoes.map((s) => ({
          ...s,
          itens: s.itens.map((i) => i.trim()).filter(Boolean),
        })),
      };
      form.clearErrors();
      const v = cardapioSchema.safeParse(limpo);
      if (!v.success) {
        for (const issue of v.error.issues)
          form.setError(issue.path.join('.') as 'secoes', { message: issue.message });
        toast.erro('Confira os campos destacados.');
        return;
      }
      const r = await salvarCardapio(pacoteId, limpo);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(limpo);
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <Secao
      id="cardapio"
      titulo="Cardápio"
      descricao="Organize em seções (ex.: Salgados, Bebidas, Doces), cada uma com seus itens."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      {fields.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhuma seção. O cardápio ajuda o cliente a decidir pelo pacote.
        </p>
      )}
      <ul className="space-y-3">
        {fields.map((campo, i) => (
          <li key={campo.id} className="rounded-card space-y-3 border p-3">
            <div className="flex items-start gap-2">
              <Campo
                id={`secao-nome-${i}`}
                rotulo={`Nome da seção ${i + 1}`}
                erro={lerErro(e, `secoes.${i}.nome`)}
                className="flex-1"
              >
                <Input
                  id={`secao-nome-${i}`}
                  placeholder="Ex.: Salgados"
                  {...form.register(`secoes.${i}.nome`)}
                />
              </Campo>
              {!somenteLeitura && (
                <div className="mt-6 flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={i === 0}
                    aria-label={`Subir seção ${i + 1}`}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={i === fields.length - 1}
                    aria-label={`Descer seção ${i + 1}`}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover seção ${i + 1}`}
                    onClick={() => remove(i)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              )}
            </div>
            <Campo
              id={`secao-itens-${i}`}
              rotulo="Itens"
              dica="Enter cria o próximo item."
              erro={lerErro(e, `secoes.${i}.itens`)}
            >
              <Controller
                control={form.control}
                name={`secoes.${i}.itens`}
                render={({ field }) => (
                  <EditorItensCardapio
                    id={`secao-itens-${i}`}
                    valor={field.value}
                    onChange={field.onChange}
                    disabled={somenteLeitura}
                  />
                )}
              />
            </Campo>
          </li>
        ))}
      </ul>
      {!somenteLeitura && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ nome: '', itens: [''] })}
        >
          <Plus aria-hidden /> Adicionar seção
        </Button>
      )}
    </Secao>
  );
}

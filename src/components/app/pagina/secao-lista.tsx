'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useTransition } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { ListaOrdenavel } from '@/components/app/campos/lista-ordenavel';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor, lerErro } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LIMITES_PAGINA as L, type Pergunta } from '@/domain/publico/pagina';
import {
  depoimentosSchema,
  perguntasSchema,
  type DepoimentosEntrada,
  type PerguntasEntrada,
} from '@/domain/validacao/pagina';
import { salvarDepoimentos, salvarPerguntas } from '@/server/actions/empresa/pagina';
import { usePrevia } from './previa';

/** Depoimentos cadastrados pelo dono (até 6). Sem nenhum, a seção some da página. */
export function SecaoDepoimentos({ inicial }: { inicial: DepoimentosEntrada['itens'] }) {
  const toast = useToast();
  const { atualizar } = usePrevia();
  const [salvando, iniciar] = useTransition();
  const form = useForm<DepoimentosEntrada>({
    resolver: zodResolver(depoimentosSchema),
    defaultValues: { itens: inicial },
  });
  const { fields, append, remove, swap } = useFieldArray({ control: form.control, name: 'itens' });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarDepoimentos(valores);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(valores);
        atualizar();
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <Secao
      id="pagina-depoimentos"
      titulo={`Depoimentos (${fields.length}/${L.depoimentos})`}
      descricao="Só o que seus clientes disseram de verdade. Nunca mostramos nota ou estrelas."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
    >
      {fields.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhum depoimento: a seção não aparece na página.
        </p>
      )}
      <ListaOrdenavel
        itens={fields}
        chave={(f) => f.id}
        rotulo={(f) => `depoimento de ${f.nome || 'cliente'}`}
        onReordenar={(novos) => {
          // a lista só sobe/desce um item por vez: é uma troca de vizinhos
          const de = fields.findIndex((f, i) => f.id !== novos[i]?.id);
          const para = novos.findIndex((n) => n.id === fields[de]?.id);
          if (de >= 0 && para >= 0) swap(de, para);
        }}
      >
        {(f, i) => (
          <div className="rounded-card space-y-3 border p-3" data-testid="depoimento-editor">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                id={`dep-nome-${i}`}
                rotulo="Nome do cliente"
                erro={lerErro(e, `itens.${i}.nome`)}
              >
                <Input
                  id={`dep-nome-${i}`}
                  maxLength={L.depoimentoNome}
                  {...form.register(`itens.${i}.nome`)}
                />
              </Campo>
              <Campo
                id={`dep-tipo-${i}`}
                rotulo="Festa (opcional)"
                erro={lerErro(e, `itens.${i}.tipoFesta`)}
              >
                <Input
                  id={`dep-tipo-${i}`}
                  placeholder="Ex.: Aniversário de 5 anos"
                  maxLength={L.depoimentoTipo}
                  {...form.register(`itens.${i}.tipoFesta`)}
                />
              </Campo>
            </div>
            <Campo
              id={`dep-texto-${i}`}
              rotulo="O que o cliente disse"
              erro={lerErro(e, `itens.${i}.texto`)}
            >
              <Textarea
                id={`dep-texto-${i}`}
                rows={3}
                maxLength={L.depoimentoTexto}
                {...form.register(`itens.${i}.texto`)}
              />
            </Campo>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
              <Trash2 aria-hidden /> Remover depoimento
            </Button>
          </div>
        )}
      </ListaOrdenavel>
      {fields.length < L.depoimentos && (
        <Button
          type="button"
          variant="outline"
          onClick={() => append({ nome: '', tipoFesta: '', texto: '' })}
        >
          <Plus aria-hidden /> Adicionar depoimento
        </Button>
      )}
    </Secao>
  );
}

/** Perguntas do dono (até 8), depois das automáticas (mostradas como prévia, sem edição). */
export function SecaoPerguntas({
  inicial,
  automaticas,
}: {
  inicial: PerguntasEntrada['itens'];
  automaticas: Pergunta[];
}) {
  const toast = useToast();
  const { atualizar } = usePrevia();
  const [salvando, iniciar] = useTransition();
  const form = useForm<PerguntasEntrada>({
    resolver: zodResolver(perguntasSchema),
    defaultValues: { itens: inicial },
  });
  const { fields, append, remove, swap } = useFieldArray({ control: form.control, name: 'itens' });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarPerguntas(valores);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(valores);
        atualizar();
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <Secao
      id="pagina-perguntas"
      titulo={`Perguntas frequentes (${fields.length}/${L.perguntas})`}
      descricao="As automáticas saem dos seus dados (duração, convidados, cardápio). Acrescente as suas."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
    >
      {automaticas.length > 0 && (
        <details className="rounded-card bg-muted/50 border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {automaticas.length} perguntas automáticas
          </summary>
          <ul className="mt-2 space-y-2">
            {automaticas.map((p) => (
              <li key={p.pergunta}>
                <p className="font-semibold">{p.pergunta}</p>
                <p className="text-muted-foreground">{p.resposta}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      <ListaOrdenavel
        itens={fields}
        chave={(f) => f.id}
        rotulo={(f) => f.pergunta || 'pergunta'}
        onReordenar={(novos) => {
          const de = fields.findIndex((f, i) => f.id !== novos[i]?.id);
          const para = novos.findIndex((n) => n.id === fields[de]?.id);
          if (de >= 0 && para >= 0) swap(de, para);
        }}
      >
        {(f, i) => (
          <div className="rounded-card space-y-3 border p-3" data-testid="pergunta-editor">
            <Campo id={`perg-${i}`} rotulo="Pergunta" erro={lerErro(e, `itens.${i}.pergunta`)}>
              <Input
                id={`perg-${i}`}
                maxLength={L.pergunta}
                {...form.register(`itens.${i}.pergunta`)}
              />
            </Campo>
            <Campo id={`resp-${i}`} rotulo="Resposta" erro={lerErro(e, `itens.${i}.resposta`)}>
              <Textarea
                id={`resp-${i}`}
                rows={2}
                maxLength={L.resposta}
                {...form.register(`itens.${i}.resposta`)}
              />
            </Campo>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
              <Trash2 aria-hidden /> Remover pergunta
            </Button>
          </div>
        )}
      </ListaOrdenavel>
      {fields.length < L.perguntas && (
        <Button
          type="button"
          variant="outline"
          onClick={() => append({ pergunta: '', resposta: '' })}
        >
          <Plus aria-hidden /> Adicionar pergunta
        </Button>
      )}
    </Secao>
  );
}

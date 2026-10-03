'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, ExternalLink } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { gerarSlug } from '@/domain/slug';
import { slugSchema, type SlugEntrada } from '@/domain/validacao/empresa';
import { alterarSlug } from '@/server/actions/empresa/identidade';

export function FormSlug({
  slugAtual,
  urlSite,
  somenteLeitura,
}: {
  slugAtual: string;
  urlSite: string;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const [atual, setAtual] = useState(slugAtual);
  const form = useForm<SlugEntrada>({
    resolver: zodResolver(slugSchema),
    defaultValues: { slug: slugAtual },
  });
  const e = form.formState.errors;
  const link = `${urlSite}/b/${atual}`;

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await alterarSlug(valores);
      if (r.ok && r.dados) {
        toast.sucesso(r.mensagem);
        setAtual(r.dados.slug);
        form.reset({ slug: r.dados.slug });
      } else if (!r.ok) {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <Secao
      titulo="Link do buffet"
      descricao="É o endereço que você divulga para os clientes montarem o orçamento."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
      textoBotao="Alterar link"
    >
      <div className="rounded-control bg-muted flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium" data-testid="link-atual">
          {link}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => {
            await navigator.clipboard?.writeText(link);
            toast.sucesso('Link copiado.');
          }}
        >
          <Copy aria-hidden /> Copiar
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href={`/b/${atual}`} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden /> Abrir
          </a>
        </Button>
      </div>
      <Campo
        id="slug"
        rotulo="Final do link"
        erro={e.slug?.message}
        dica="Se você trocar, o link antigo continua funcionando por 12 meses e leva para o novo."
      >
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground shrink-0 text-sm">/b/</span>
          <Input
            id="slug"
            autoCapitalize="none"
            autoCorrect="off"
            aria-invalid={!!e.slug || undefined}
            // já vem preenchido no HTML (antes da hidratação o campo não fica vazio)
            defaultValue={slugAtual}
            {...form.register('slug', {
              onBlur: (ev: React.FocusEvent<HTMLInputElement>) => {
                const normalizado = gerarSlug(ev.target.value);
                if (normalizado && normalizado !== ev.target.value)
                  form.setValue('slug', normalizado, { shouldDirty: true });
              },
            })}
          />
        </div>
      </Campo>
    </Secao>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Campo, CampoCheck } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  estiloEfetivo,
  ESTILOS,
  LIMITES_PAGINA as L,
  ROTULO_ESTILO,
  sugestoesDiferenciais,
  sugestoesSlogan,
  type Segmento,
} from '@/domain/publico/pagina';
import { textosPaginaSchema, type TextosPaginaEntrada } from '@/domain/validacao/pagina';
import { salvarTextosPagina } from '@/server/actions/empresa/pagina';
import { cn } from '@/lib/utils';
import { usePrevia } from './previa';

/** Frase, estilo, diferenciais e endereço da página pública. */
export function FormTextosPagina({
  inicial,
  segmento,
}: {
  inicial: TextosPaginaEntrada;
  segmento: Segmento;
}) {
  const toast = useToast();
  const { atualizar } = usePrevia();
  const [salvando, iniciar] = useTransition();
  const form = useForm<TextosPaginaEntrada>({
    resolver: zodResolver(textosPaginaSchema),
    defaultValues: { ...inicial, estilo: inicial.estilo || estiloEfetivo(null, segmento) },
  });
  const { register, formState, watch, setValue } = form;
  const e = formState.errors;
  const slogan = watch('slogan') ?? '';
  const estilo = watch('estilo');
  const diferenciais = watch('diferenciais');
  const [novo, setNovo] = useState('');

  const definirDiferenciais = (lista: string[]) =>
    setValue('diferenciais', lista, { shouldDirty: true, shouldValidate: true });
  const adicionar = (texto: string) => {
    const t = texto.trim();
    if (!t || diferenciais.length >= L.diferenciais) return;
    if (diferenciais.some((d) => d.toLowerCase() === t.toLowerCase())) return;
    definirDiferenciais([...diferenciais, t]);
    setNovo('');
  };

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarTextosPagina(valores);
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

  const erroDif = e.diferenciais?.message ?? e.diferenciais?.root?.message;

  return (
    <Secao
      id="pagina-textos"
      titulo="Apresentação e estilo"
      descricao="O que o cliente lê primeiro e o jeito da sua página."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={formState.isDirty}
    >
      <Campo
        id="slogan"
        rotulo="Frase de apresentação"
        erro={e.slogan?.message}
        dica={`${slogan.length}/${L.slogan} caracteres. Aparece logo abaixo do nome.`}
      >
        <Input id="slogan" maxLength={L.slogan} {...register('slogan')} />
      </Campo>
      <div className="-mt-2 flex flex-wrap gap-2" aria-label="Sugestões de frase">
        {sugestoesSlogan(segmento).map((s) => (
          <button
            key={s}
            type="button"
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-full px-3 py-1.5 text-left text-xs"
            onClick={() => setValue('slogan', s, { shouldDirty: true, shouldValidate: true })}
          >
            {s}
          </button>
        ))}
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Estilo da página</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3" role="radiogroup">
          {ESTILOS.map((s) => (
            <label
              key={s}
              className={cn(
                'rounded-card hover:border-ring has-focus-visible:ring-ring/50 flex cursor-pointer flex-col gap-1 border p-3 has-focus-visible:ring-[3px]',
                estilo === s && 'border-primary bg-secondary',
              )}
              data-testid={`estilo-${s}`}
            >
              <input type="radio" value={s} className="sr-only" {...register('estilo')} />
              <span
                className={cn(
                  'text-lg font-bold',
                  s === 'festivo' && 'font-[family-name:ui-rounded,var(--font-manrope)]',
                  s === 'elegante' && 'font-serif',
                )}
              >
                {ROTULO_ESTILO[s].nome}
              </span>
              <span className="text-muted-foreground text-xs">{ROTULO_ESTILO[s].descricao}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm font-medium" id="rotulo-diferenciais">
          Diferenciais ({diferenciais.length}/{L.diferenciais})
        </p>
        {diferenciais.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-labelledby="rotulo-diferenciais">
            {diferenciais.map((d) => (
              <li
                key={d}
                className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm"
              >
                {d}
                <button
                  type="button"
                  className="hover:bg-background/60 grid size-7 place-items-center rounded-full"
                  aria-label={`Remover ${d}`}
                  onClick={() => definirDiferenciais(diferenciais.filter((x) => x !== d))}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {diferenciais.length < L.diferenciais && (
          <div className="flex gap-2">
            <Input
              aria-label="Novo diferencial"
              placeholder="Ex.: Espaço próprio"
              maxLength={L.diferencialMax}
              value={novo}
              onChange={(ev) => setNovo(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') {
                  ev.preventDefault();
                  adicionar(novo);
                }
              }}
            />
            <Button type="button" variant="outline" onClick={() => adicionar(novo)}>
              <Plus aria-hidden /> Adicionar
            </Button>
          </div>
        )}
        {diferenciais.length < L.diferenciais && (
          <div className="flex flex-wrap gap-2" aria-label="Sugestões de diferenciais">
            {sugestoesDiferenciais(segmento, diferenciais).map((s) => (
              <button
                key={s}
                type="button"
                className="hover:bg-secondary rounded-full border border-dashed px-3 py-1 text-xs"
                onClick={() => adicionar(s)}
              >
                + {s}
              </button>
            ))}
          </div>
        )}
        {erroDif && (
          <p className="text-destructive text-xs" role="alert">
            {erroDif}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="bairro" rotulo="Bairro" erro={e.bairro?.message} dica="Aparece em “Onde fica”.">
          <Input id="bairro" maxLength={L.bairro} {...register('bairro')} />
        </Campo>
        <Campo
          id="endereco-pagina"
          rotulo="Endereço completo"
          erro={e.endereco?.message}
          dica="O mesmo do rodapé da proposta."
        >
          <Input id="endereco-pagina" {...register('endereco')} />
        </Campo>
      </div>
      <CampoCheck
        id="mostrar-endereco"
        rotulo="Mostrar o endereço completo na página"
        dica="Sem marcar, o cliente vê só bairro e cidade (o botão do mapa usa o mesmo texto)."
        {...register('mostrarEndereco')}
      />
    </Secao>
  );
}

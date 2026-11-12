'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye } from 'lucide-react';
import Link from 'next/link';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { ROTULO_MODELO_VISUAL, type ModeloVisual } from '@/domain/proposta/visual';
import { modeloPropostaSchema, type ModeloPropostaEntrada } from '@/domain/validacao/empresa';
import { salvarModeloProposta } from '@/server/actions/empresa/identidade';
import { cn } from '@/lib/utils';

const OPCOES = ['automatico', 'elegante', 'alegre'] as const;

/** Modelo visual da proposta (web e PDF): automático pelo tipo de buffet, elegante ou alegre. */
export function FormModeloProposta({
  inicial,
  padrao,
  somenteLeitura,
}: {
  inicial: ModeloPropostaEntrada;
  /** o que "automático" escolhe para este buffet */
  padrao: ModeloVisual;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<ModeloPropostaEntrada>({
    resolver: zodResolver(modeloPropostaSchema),
    defaultValues: inicial,
  });
  const { register, formState, watch } = form;
  const atual = watch('modelo');

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarModeloProposta(valores);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(valores);
      } else {
        toast.erro(r.erro);
      }
    }),
  );

  const rotulo = (o: (typeof OPCOES)[number]) =>
    o === 'automatico'
      ? {
          nome: 'Automático',
          descricao: `Escolhe pelo seu tipo de buffet. Hoje: ${ROTULO_MODELO_VISUAL[padrao].nome.toLowerCase()}.`,
        }
      : ROTULO_MODELO_VISUAL[o];

  return (
    <Secao
      titulo="Modelo da proposta"
      descricao="Como a proposta aparece para o cliente, na tela e no PDF. Vale também para as propostas já enviadas."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <fieldset>
        <legend className="sr-only">Modelo da proposta</legend>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
          {OPCOES.map((o) => (
            <label
              key={o}
              className={cn(
                'rounded-card hover:border-ring has-focus-visible:ring-ring/50 flex min-h-11 cursor-pointer flex-col gap-1 border p-3 has-focus-visible:ring-[3px]',
                atual === o && 'border-primary bg-secondary',
              )}
              data-testid={`modelo-proposta-${o}`}
            >
              <input type="radio" value={o} className="sr-only" {...register('modelo')} />
              <span
                className={cn(
                  'text-lg font-bold',
                  o === 'elegante' && 'font-serif font-medium',
                  o === 'alegre' && 'font-[family-name:ui-rounded,var(--font-manrope)]',
                )}
              >
                {rotulo(o).nome}
              </span>
              <span className="text-muted-foreground text-xs">{rotulo(o).descricao}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Link
        href="/app/empresa/proposta-exemplo"
        className="text-primary-texto inline-flex min-h-11 items-center gap-2 text-sm font-semibold hover:underline"
      >
        <Eye className="size-4" aria-hidden />
        Ver como fica uma proposta
      </Link>
    </Secao>
  );
}

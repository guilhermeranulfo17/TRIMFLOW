'use client';

import Link from 'next/link';
import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { mascaraTelefoneBR } from '@/domain/mascara';
import { INFO_TIPO_BUFFET, TIPOS_BUFFET, type TipoBuffet } from '@/domain/modelos/tipos-buffet';
import { cn } from '@/lib/utils';

type CamposBuffet = {
  nome: string;
  nomeBuffet: string;
  whatsapp: string;
  tipoBuffet: TipoBuffet;
  aceite: boolean;
};

/**
 * Nome, buffet, WhatsApp e o tipo de buffet (cadastro e "completar" de quem entrou pelo Google).
 * O tipo escolhe o catálogo de exemplo e adapta as telas (§90).
 */
export function CamposDoBuffet({ focoNoNome = false }: { focoNoNome?: boolean }) {
  const { control } = useFormContext<CamposBuffet>();
  return (
    <>
      <FormField
        control={control}
        name="nome"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Seu nome</FormLabel>
            <FormControl>
              <Input autoComplete="name" autoFocus={focoNoNome} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="nomeBuffet"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nome do buffet</FormLabel>
            <FormControl>
              <Input autoComplete="organization" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="tipoBuffet"
        render={({ field, fieldState }) => (
          <FormItem>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Que tipo de buffet é o seu?</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {TIPOS_BUFFET.map((t) => {
                  const ativo = field.value === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => field.onChange(t)}
                      onBlur={field.onBlur}
                      className={cn(
                        'rounded-control flex min-h-16 flex-col items-start justify-center border px-3 py-2 text-left',
                        ativo
                          ? 'border-primary bg-primary/10 ring-primary ring-1'
                          : 'hover:border-ring',
                        fieldState.error && !ativo && 'border-destructive',
                      )}
                      data-testid={`tipo-buffet-${t}`}
                    >
                      <span className="text-sm font-semibold">{INFO_TIPO_BUFFET[t].rotulo}</span>
                      <span className="text-muted-foreground text-xs">
                        {INFO_TIPO_BUFFET[t].dica}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="whatsapp"
        render={({ field }) => (
          <FormItem>
            <FormLabel>WhatsApp (com DDD)</FormLabel>
            <FormControl>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(34) 99135-5450"
                {...field}
                onChange={(e) => field.onChange(mascaraTelefoneBR(e.target.value))}
              />
            </FormControl>
            <FormDescription>
              É por aqui que avisamos quando um cliente quiser reservar.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

/** Aceite dos termos (obrigatório para criar a conta). */
export function CampoAceite() {
  const { control } = useFormContext<CamposBuffet>();
  return (
    <FormField
      control={control}
      name="aceite"
      render={({ field }) => (
        <FormItem>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
              onBlur={field.onBlur}
              className="accent-primary mt-0.5 size-4 shrink-0"
              aria-describedby="aceite-descricao"
            />
            <span id="aceite-descricao">
              Li e aceito os{' '}
              <Link
                href="/termos"
                target="_blank"
                className="text-primary-texto font-semibold underline-offset-2 hover:underline"
              >
                termos de uso
              </Link>{' '}
              e a{' '}
              <Link
                href="/privacidade"
                target="_blank"
                className="text-primary-texto font-semibold underline-offset-2 hover:underline"
              >
                política de privacidade
              </Link>
              .
            </span>
          </label>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

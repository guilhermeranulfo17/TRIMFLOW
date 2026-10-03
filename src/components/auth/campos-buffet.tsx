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
import { ROTULO_SEGMENTO, SEGMENTOS, type Segmento } from '@/domain/validacao/cadastro';
import { cn } from '@/lib/utils';

type CamposBuffet = {
  nome: string;
  nomeBuffet: string;
  whatsapp: string;
  segmento: Segmento;
  aceite: boolean;
};

/** Nome, buffet, WhatsApp e segmento (cadastro e "completar" de quem entrou pelo Google). */
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
        name="whatsapp"
        render={({ field }) => (
          <FormItem>
            <FormLabel>WhatsApp</FormLabel>
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
      <FormField
        control={control}
        name="segmento"
        render={({ field, fieldState }) => (
          <FormItem>
            <p
              id="rotulo-segmento"
              className={cn(
                'text-sm leading-none font-medium',
                fieldState.error && 'text-destructive',
              )}
            >
              Tipo de buffet
            </p>
            <div
              role="radiogroup"
              aria-labelledby="rotulo-segmento"
              aria-invalid={!!fieldState.error}
              className="grid gap-2"
            >
              {SEGMENTOS.map((segmento) => {
                const marcado = field.value === segmento;
                return (
                  <label
                    key={segmento}
                    className={cn(
                      'rounded-control flex min-h-11 cursor-pointer items-center gap-3 border px-3 py-2.5 text-sm transition-colors',
                      marcado ? 'border-primary bg-accent font-semibold' : 'hover:bg-muted',
                    )}
                  >
                    <input
                      type="radio"
                      name={field.name}
                      value={segmento}
                      checked={marcado}
                      onChange={() => field.onChange(segmento)}
                      onBlur={field.onBlur}
                      className="accent-primary size-4"
                    />
                    {ROTULO_SEGMENTO[segmento]}
                  </label>
                );
              })}
            </div>
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

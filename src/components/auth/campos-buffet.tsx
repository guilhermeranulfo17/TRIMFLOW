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

type CamposBuffet = {
  nome: string;
  nomeBuffet: string;
  whatsapp: string;
  aceite: boolean;
};

/**
 * Nome, buffet e WhatsApp (cadastro e "completar" de quem entrou pelo Google). Só o mínimo: o
 * tipo de buffet não é mais perguntado aqui (a conta nasce com o modelo infantil).
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

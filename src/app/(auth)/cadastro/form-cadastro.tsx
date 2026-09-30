'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { AvisoForm } from '@/components/auth/aviso-form';
import { CampoSenha } from '@/components/auth/campo-senha';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { mascaraTelefoneBR } from '@/domain/mascara';
import { cadastroSchema, ROTULO_SEGMENTO, SEGMENTOS } from '@/domain/validacao/auth';
import { cn } from '@/lib/utils';
import { cadastrar } from '@/server/actions/auth';

type Entrada = z.input<typeof cadastroSchema>;
type Saida = z.output<typeof cadastroSchema>;

export function FormCadastro() {
  const [erro, setErro] = useState<string>();
  const [sucesso, setSucesso] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const form = useForm<Entrada, unknown, Saida>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: {
      nome: '',
      email: '',
      whatsapp: '',
      senha: '',
      nomeBuffet: '',
      segmento: undefined,
    },
  });

  function onSubmit(valores: Saida) {
    setErro(undefined);
    iniciar(async () => {
      const r = await cadastrar(valores);
      if (!r) return;
      if (r.ok) setSucesso(r.mensagem);
      else setErro(r.erro);
    });
  }

  if (sucesso) return <AvisoForm tipo="sucesso">{sucesso}</AvisoForm>;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {erro && <AvisoForm tipo="erro">{erro}</AvisoForm>}
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Seu nome</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" inputMode="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
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
          control={form.control}
          name="senha"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Senha</FormLabel>
              <FormControl>
                <CampoSenha autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription>Pelo menos 8 caracteres.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
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
          control={form.control}
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
        <Button type="submit" className="w-full" size="lg" disabled={enviando}>
          {enviando ? 'Criando conta…' : 'Criar conta'}
        </Button>
      </form>
    </Form>
  );
}

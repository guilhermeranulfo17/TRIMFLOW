'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { AvisoForm } from '@/components/auth/aviso-form';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { recuperarSenhaSchema } from '@/domain/validacao/auth';
import { recuperarSenha } from '@/server/actions/auth';

export function FormRecuperarSenha({ avisoInicial }: { avisoInicial?: string }) {
  const [erro, setErro] = useState<string | undefined>(avisoInicial);
  const [sucesso, setSucesso] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const form = useForm<
    z.input<typeof recuperarSenhaSchema>,
    unknown,
    z.output<typeof recuperarSenhaSchema>
  >({
    resolver: zodResolver(recuperarSenhaSchema),
    defaultValues: { email: '' },
  });

  function onSubmit(valores: z.output<typeof recuperarSenhaSchema>) {
    setErro(undefined);
    iniciar(async () => {
      const r = await recuperarSenha(valores);
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
        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar link'}
        </Button>
      </form>
    </Form>
  );
}

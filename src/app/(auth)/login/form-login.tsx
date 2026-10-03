'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { AvisoForm } from '@/components/auth/aviso-form';
import { CampoSenha } from '@/components/auth/campo-senha';
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
import { loginSchema } from '@/domain/validacao/auth';
import { entrar } from '@/server/actions/auth';

export function FormLogin({ next, avisoInicial }: { next: string | null; avisoInicial?: string }) {
  const [erro, setErro] = useState<string | undefined>(avisoInicial);
  const [enviando, iniciar] = useTransition();
  const form = useForm<z.input<typeof loginSchema>, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', senha: '' },
  });

  function onSubmit(valores: z.output<typeof loginSchema>) {
    setErro(undefined);
    iniciar(async () => {
      const r = await entrar(valores, next);
      if (r && !r.ok) setErro(r.erro);
    });
  }

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
        <FormField
          control={form.control}
          name="senha"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Senha</FormLabel>
                <Link
                  href="/recuperar-senha"
                  className="text-primary-texto text-sm hover:underline"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <FormControl>
                <CampoSenha autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </Form>
  );
}

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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { novaSenhaSchema } from '@/domain/validacao/auth';
import { definirNovaSenha } from '@/server/actions/auth';

export function FormNovaSenha() {
  const [erro, setErro] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const form = useForm<z.input<typeof novaSenhaSchema>, unknown, z.output<typeof novaSenhaSchema>>({
    resolver: zodResolver(novaSenhaSchema),
    defaultValues: { senha: '', confirmacao: '' },
  });

  function onSubmit(valores: z.output<typeof novaSenhaSchema>) {
    setErro(undefined);
    iniciar(async () => {
      const r = await definirNovaSenha(valores);
      if (r && !r.ok) setErro(r.erro);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {erro && <AvisoForm tipo="erro">{erro}</AvisoForm>}
        <FormField
          control={form.control}
          name="senha"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nova senha</FormLabel>
              <FormControl>
                <CampoSenha autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmacao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirme a nova senha</FormLabel>
              <FormControl>
                <CampoSenha autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </Form>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { AvisoForm } from '@/components/auth/aviso-form';
import { CampoAceite, CamposDoBuffet } from '@/components/auth/campos-buffet';
import { CampoSenha } from '@/components/auth/campo-senha';
import { ForcaSenha } from '@/components/auth/forca-senha';
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
import { cadastroSchema } from '@/domain/validacao/cadastro';
import { cadastrar } from '@/server/actions/auth';

type Entrada = z.input<typeof cadastroSchema>;
type Saida = z.output<typeof cadastroSchema>;

/** Ordem: quem é, o buffet, como avisar, o tipo, e por último e-mail e senha. */
export function FormCadastro() {
  const [erro, setErro] = useState<string>();
  const [sucesso, setSucesso] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const form = useForm<Entrada, unknown, Saida>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: {
      nome: '',
      nomeBuffet: '',
      whatsapp: '',
      segmento: undefined,
      email: '',
      senha: '',
      aceite: false,
    },
  });
  const senha = useWatch({ control: form.control, name: 'senha' });

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
        <CamposDoBuffet focoNoNome />
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
              <FormLabel>Senha</FormLabel>
              <FormControl>
                <CampoSenha autoComplete="new-password" {...field} />
              </FormControl>
              <ForcaSenha senha={senha ?? ''} />
              <FormMessage />
            </FormItem>
          )}
        />
        <CampoAceite />
        <Button type="submit" className="w-full" size="lg" disabled={enviando}>
          {enviando ? 'Criando conta…' : 'Criar conta grátis'}
        </Button>
      </form>
    </Form>
  );
}

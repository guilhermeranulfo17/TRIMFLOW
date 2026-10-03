'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { AvisoForm } from '@/components/auth/aviso-form';
import { CampoAceite, CamposDoBuffet } from '@/components/auth/campos-buffet';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { completarSchema } from '@/domain/validacao/cadastro';
import { completarConta } from '@/server/actions/auth';

type Entrada = z.input<typeof completarSchema>;
type Saida = z.output<typeof completarSchema>;

export function FormCompletar({ nome }: { nome: string }) {
  const [erro, setErro] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const form = useForm<Entrada, unknown, Saida>({
    resolver: zodResolver(completarSchema),
    defaultValues: { nome, nomeBuffet: '', whatsapp: '', segmento: undefined, aceite: false },
  });

  function onSubmit(valores: Saida) {
    setErro(undefined);
    iniciar(async () => {
      const r = await completarConta(valores);
      if (r && !r.ok) setErro(r.erro);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {erro && <AvisoForm tipo="erro">{erro}</AvisoForm>}
        <CamposDoBuffet focoNoNome={!nome} />
        <CampoAceite />
        <Button type="submit" className="w-full" size="lg" disabled={enviando}>
          {enviando ? 'Criando conta…' : 'Começar meus 14 dias grátis'}
        </Button>
      </form>
    </Form>
  );
}

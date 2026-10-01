'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Campo, CampoCheck } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { FormInline } from '@/components/app/form/form-inline';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { espacoSchema, type EspacoEntrada } from '@/domain/validacao/catalogo';
import { salvarEspaco } from '@/server/actions/empresa/agenda-config';

export type EspacoItem = EspacoEntrada & { id: string; ativo: boolean };

export function FormEspaco({
  espaco,
  somenteLeitura,
  onFechar,
}: {
  espaco: EspacoItem | null;
  somenteLeitura: boolean;
  onFechar: () => void;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<EspacoEntrada>({
    resolver: zodResolver(espacoSchema),
    defaultValues: espaco ?? {
      nome: '',
      capacidadeMax: 100,
      eventosSimultaneos: 1,
      noLocalDoCliente: false,
      ativo: true,
    },
  });
  const e = form.formState.errors;
  const p = espaco?.id ?? 'novo';

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarEspaco(espaco?.id ?? null, valores);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(valores);
        onFechar();
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <FormInline
      onSubmit={onSubmit}
      onCancelar={onFechar}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <Campo id={`espaco-nome-${p}`} rotulo="Nome do espaço" erro={e.nome?.message}>
        <Input
          id={`espaco-nome-${p}`}
          placeholder="Ex.: Salão principal"
          aria-invalid={!!e.nome || undefined}
          {...form.register('nome')}
        />
      </Campo>
      <Campo
        id={`espaco-capacidade-${p}`}
        rotulo="Capacidade máxima (convidados)"
        erro={e.capacidadeMax?.message}
      >
        <Input
          id={`espaco-capacidade-${p}`}
          type="number"
          inputMode="numeric"
          min={1}
          className="w-32"
          aria-invalid={!!e.capacidadeMax || undefined}
          {...form.register('capacidadeMax', { valueAsNumber: true })}
        />
      </Campo>
      <Campo
        id={`espaco-simultaneos-${p}`}
        rotulo="Eventos ao mesmo tempo"
        dica="Salão = 1. Buffet em domicílio: quantas festas a equipe atende ao mesmo tempo."
        erro={e.eventosSimultaneos?.message}
      >
        <Input
          id={`espaco-simultaneos-${p}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          className="w-32"
          aria-invalid={!!e.eventosSimultaneos || undefined}
          {...form.register('eventosSimultaneos', { valueAsNumber: true })}
        />
      </Campo>
      <CampoCheck
        id={`espaco-local-${p}`}
        rotulo="A festa acontece no local do cliente"
        dica="Marque para buffet em domicílio (o espaço é do cliente)."
        {...form.register('noLocalDoCliente')}
      />
      <CampoCheck
        id={`espaco-ativo-${p}`}
        rotulo="Ativo"
        dica="Espaço inativo não aparece para o cliente."
        {...form.register('ativo')}
      />
    </FormInline>
  );
}

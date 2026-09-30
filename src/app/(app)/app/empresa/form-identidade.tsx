'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { CampoTelefone } from '@/components/app/campos';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { classeCampo } from '@/components/app/form/estilos';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  FUSOS_BR,
  identidadeSchema,
  UFS,
  type IdentidadeEntrada,
} from '@/domain/validacao/empresa';
import { salvarIdentidade } from '@/server/actions/empresa/identidade';

export function FormIdentidade({
  inicial,
  somenteLeitura,
}: {
  inicial: IdentidadeEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<IdentidadeEntrada>({
    resolver: zodResolver(identidadeSchema),
    defaultValues: inicial,
  });
  const { register, formState, control, watch, setValue } = form;
  const e = formState.errors;
  const cor = watch('corMarca');
  const sobre = watch('sobre') ?? '';

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarIdentidade(valores);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(valores);
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  const fusoConhecido = FUSOS_BR.some((f) => f.valor === inicial.fuso);

  return (
    <Secao
      titulo="Identidade do buffet"
      descricao="Como o seu buffet aparece para os clientes."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <Campo id="nome" rotulo="Nome do buffet" erro={e.nome?.message}>
        <Input id="nome" aria-invalid={!!e.nome || undefined} {...register('nome')} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="whatsapp" rotulo="WhatsApp do buffet" erro={e.whatsappE164?.message}>
          <Controller
            control={control}
            name="whatsappE164"
            render={({ field }) => (
              <CampoTelefone
                id="whatsapp"
                valor={field.value}
                onChange={field.onChange}
                invalido={!!e.whatsappE164}
              />
            )}
          />
        </Campo>
        <Campo id="email" rotulo="E-mail de contato" erro={e.email?.message}>
          <Input
            id="email"
            type="email"
            inputMode="email"
            aria-invalid={!!e.email || undefined}
            {...register('email')}
          />
        </Campo>
        <Campo id="cidade" rotulo="Cidade" erro={e.cidade?.message}>
          <Input id="cidade" {...register('cidade')} />
        </Campo>
        <Campo id="uf" rotulo="Estado" erro={e.uf?.message}>
          <select id="uf" className={classeCampo} {...register('uf')}>
            <option value="">Escolha</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo
        id="fuso"
        rotulo="Fuso horário"
        erro={e.fuso?.message}
        dica="Usado para datas e prazos."
      >
        <select id="fuso" className={classeCampo} {...register('fuso')}>
          {!fusoConhecido && <option value={inicial.fuso}>{inicial.fuso}</option>}
          {FUSOS_BR.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <Campo
        id="cor"
        rotulo="Cor da marca"
        erro={e.corMarca?.message}
        dica="Aparece na página e na proposta do buffet."
      >
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Escolher cor"
            value={/^#[0-9A-Fa-f]{6}$/.test(cor) ? cor : '#7C5CD6'}
            onChange={(ev) =>
              setValue('corMarca', ev.target.value.toUpperCase(), { shouldDirty: true })
            }
            className="rounded-control bg-card h-11 w-14 shrink-0 cursor-pointer border p-1 disabled:cursor-not-allowed"
          />
          <Input
            id="cor"
            className="max-w-36 font-mono uppercase"
            aria-invalid={!!e.corMarca || undefined}
            {...register('corMarca')}
          />
        </div>
      </Campo>
      <Campo
        id="sobre"
        rotulo="Sobre o buffet"
        erro={e.sobre?.message}
        dica={`${sobre.length}/600 caracteres`}
      >
        <Textarea id="sobre" rows={4} maxLength={600} {...register('sobre')} />
      </Campo>
    </Secao>
  );
}

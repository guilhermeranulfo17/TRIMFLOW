'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { CampoPercentual } from '@/components/app/campos';
import { Campo, CampoCheck } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  condicoesSchema,
  FORMAS_PAGAMENTO_SUGERIDAS,
  type CondicoesEntrada,
} from '@/domain/validacao/regras';
import { salvarCondicoes } from '@/server/actions/empresa/regras';

const MODOS = [
  { valor: 'exato', titulo: 'Preço exato', texto: 'O cliente vê o valor final.' },
  { valor: 'faixa', titulo: 'Faixa de preço', texto: 'O cliente vê um valor aproximado.' },
  {
    valor: 'apos_contato',
    titulo: 'Só após contato',
    texto: 'O preço aparece depois que você falar com o cliente.',
  },
] as const;

const INCIDENCIAS = [
  { valor: 'pacote', titulo: 'Só sobre o pacote' },
  { valor: 'pacote_opcionais', titulo: 'Sobre o pacote e os opcionais' },
] as const;

function OpcoesRadio<T extends string>({
  legenda,
  opcoes,
  atual,
  registrar,
}: {
  legenda: string;
  opcoes: readonly { valor: T; titulo: string; texto?: string }[];
  atual: T;
  registrar: React.ComponentProps<'input'>;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legenda}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {opcoes.map((o) => (
          <label
            key={o.valor}
            className={cn(
              'rounded-card flex min-h-11 cursor-pointer gap-3 border p-3 text-sm',
              atual === o.valor && 'border-primary bg-accent/50',
            )}
          >
            <input
              type="radio"
              value={o.valor}
              className="accent-primary mt-0.5 size-5 shrink-0"
              {...registrar}
            />
            <span>
              <span className="block font-medium">{o.titulo}</span>
              {o.texto && <span className="text-muted-foreground text-xs">{o.texto}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CampoNumero({
  id,
  rotulo,
  dica,
  erro,
  sufixo,
  registrar,
}: {
  id: string;
  rotulo: string;
  dica?: string;
  erro?: string;
  sufixo: string;
  registrar: React.ComponentProps<'input'>;
}) {
  return (
    <Campo id={id} rotulo={rotulo} dica={dica} erro={erro}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          className="w-24"
          aria-invalid={!!erro || undefined}
          {...registrar}
        />
        <span className="text-muted-foreground text-sm">{sufixo}</span>
      </div>
    </Campo>
  );
}

export function FormCondicoes({
  inicial,
  somenteLeitura,
}: {
  inicial: CondicoesEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<CondicoesEntrada>({
    resolver: zodResolver(condicoesSchema),
    defaultValues: inicial,
  });
  const e = form.formState.errors;
  const n = (campo: Parameters<typeof form.register>[0]) =>
    form.register(campo, { valueAsNumber: true });
  const formas = form.watch('formasPagamento');
  const opcoesFormas = [
    ...FORMAS_PAGAMENTO_SUGERIDAS,
    ...inicial.formasPagamento.filter(
      (f) => !(FORMAS_PAGAMENTO_SUGERIDAS as readonly string[]).includes(f),
    ),
  ];

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarCondicoes(valores);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(valores);
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <Secao
      id="condicoes"
      titulo="Condições comerciais"
      descricao="Sinal, parcelas, prazos e textos que aparecem na proposta."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Campo id="cond-sinal" rotulo="Sinal para reservar" erro={e.sinalBp?.message}>
          <Controller
            control={form.control}
            name="sinalBp"
            render={({ field }) => (
              <CampoPercentual
                id="cond-sinal"
                valor={field.value}
                onChange={(v) => field.onChange(v ?? Number.NaN)}
                className="w-28"
              />
            )}
          />
        </Campo>
        <CampoNumero
          id="cond-parcelas"
          rotulo="Parcelas (máximo)"
          sufixo="x"
          erro={e.parcelasMax?.message}
          registrar={n('parcelasMax')}
        />
        <CampoNumero
          id="cond-ultima"
          rotulo="Última parcela"
          dica="Dias antes da festa"
          sufixo="dias"
          erro={e.prazoUltimaParcelaDias?.message}
          registrar={n('prazoUltimaParcelaDias')}
        />
        <CampoNumero
          id="cond-validade"
          rotulo="Validade da proposta"
          sufixo="dias"
          erro={e.validadeDias?.message}
          registrar={n('validadeDias')}
        />
        <CampoNumero
          id="cond-pre-reserva"
          rotulo="Prazo da pré-reserva"
          dica="Quanto tempo a data fica segura"
          sufixo="horas"
          erro={e.prazoPreReservaHoras?.message}
          registrar={n('prazoPreReservaHoras')}
        />
        <CampoNumero
          id="cond-antecedencia"
          rotulo="Antecedência mínima"
          dica="Dias entre o pedido e a festa"
          sufixo="dias"
          erro={e.antecedenciaMinDias?.message}
          registrar={n('antecedenciaMinDias')}
        />
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Formas de pagamento</legend>
        <div className="grid gap-x-4 sm:grid-cols-3">
          {opcoesFormas.map((f) => (
            <CampoCheck
              key={f}
              id={`forma-${f}`}
              rotulo={f}
              checked={formas.includes(f)}
              onChange={(ev) =>
                form.setValue(
                  'formasPagamento',
                  ev.target.checked ? [...formas, f] : formas.filter((x) => x !== f),
                  { shouldDirty: true },
                )
              }
            />
          ))}
        </div>
      </fieldset>

      <OpcoesRadio
        legenda="Como o preço aparece para o cliente"
        opcoes={MODOS}
        atual={form.watch('modoExibicaoPreco')}
        registrar={form.register('modoExibicaoPreco')}
      />
      <OpcoesRadio
        legenda="Os ajustes por dia incidem"
        opcoes={INCIDENCIAS}
        atual={form.watch('ajusteIncide')}
        registrar={form.register('ajusteIncide')}
      />

      <Campo id="cond-texto" rotulo="Condições gerais" erro={e.condicoesTexto?.message}>
        <Textarea id="cond-texto" rows={3} {...form.register('condicoesTexto')} />
      </Campo>
      <Campo
        id="cond-nao-incluso"
        rotulo="O que não está incluso"
        erro={e.naoInclusoTexto?.message}
      >
        <Textarea id="cond-nao-incluso" rows={3} {...form.register('naoInclusoTexto')} />
      </Campo>
      <Campo
        id="cond-cancelamento"
        rotulo="Política de cancelamento"
        erro={e.cancelamentoTexto?.message}
      >
        <Textarea id="cond-cancelamento" rows={3} {...form.register('cancelamentoTexto')} />
      </Campo>
      <Campo
        id="cond-convidados"
        rotulo="Política de alteração de convidados"
        erro={e.alteracaoConvidadosTexto?.message}
        dica="Ex.: o número de convidados pode mudar até 10 dias antes, com ajuste no valor."
      >
        <Textarea
          id="cond-convidados"
          rows={3}
          maxLength={1000}
          {...form.register('alteracaoConvidadosTexto')}
        />
      </Campo>
    </Secao>
  );
}

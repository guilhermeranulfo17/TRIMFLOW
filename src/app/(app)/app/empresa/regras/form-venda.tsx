'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { CampoDinheiro, EditorFaixasPorPessoa } from '@/components/app/campos';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor, lerErro } from '@/components/app/form/erros';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { vendaSchema, type VendaEntrada } from '@/domain/validacao/regras';
import { salvarVenda } from '@/server/actions/empresa/regras';

const MODOS = [
  {
    valor: 'pacotes',
    titulo: 'Só pacotes',
    texto: 'O cliente escolhe um dos seus pacotes e os extras.',
  },
  {
    valor: 'itens',
    titulo: 'Só itens',
    texto: 'O cliente monta a festa escolhendo os itens que quer, sem pacote.',
  },
  {
    valor: 'ambos',
    titulo: 'Os dois',
    texto: 'No link, o cliente escolhe entre um pacote pronto ou montar do jeito dele.',
  },
] as const;

/** Jeito de vender no link (§96): pacotes, itens ou os dois, e as regras do pedido por itens. */
export function FormVenda({
  inicial,
  somenteLeitura,
}: {
  inicial: VendaEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<VendaEntrada>({
    resolver: zodResolver(vendaSchema),
    defaultValues: inicial,
  });
  const e = form.formState.errors;
  const modo = form.watch('modoVenda');

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarVenda(valores);
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
      id="venda"
      titulo="Jeito de vender"
      descricao="Como o cliente monta o orçamento no seu link."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
    >
      <fieldset>
        <legend className="sr-only">Jeito de vender</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODOS.map((m) => (
            <label
              key={m.valor}
              className={cn(
                'rounded-card flex min-h-11 cursor-pointer items-start gap-3 border p-3 text-sm',
                modo === m.valor && 'border-primary bg-accent/50',
              )}
            >
              <input
                type="radio"
                value={m.valor}
                className="accent-primary mt-0.5 size-5 shrink-0"
                {...form.register('modoVenda')}
              />
              <span>
                <span className="block font-semibold">{m.titulo}</span>
                <span className="text-muted-foreground">{m.texto}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {modo !== 'pacotes' && (
        <div className="space-y-5">
          <p className="text-muted-foreground text-sm">
            Os itens são os seus opcionais (Catálogo → Opcionais), agrupados pela categoria. Item
            ligado a um pacote fica só como extra daquele pacote.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              id="venda-min-convidados"
              rotulo="Mínimo de convidados"
              dica="0 = sem mínimo"
              erro={e.minConvidadosItens?.message}
            >
              <Input
                id="venda-min-convidados"
                type="number"
                inputMode="numeric"
                min={0}
                {...form.register('minConvidadosItens', { valueAsNumber: true })}
              />
            </Campo>
            <Campo
              id="venda-pedido-minimo"
              rotulo="Pedido mínimo"
              dica="R$ 0,00 = sem mínimo"
              erro={e.pedidoMinimoCentavos?.message}
            >
              <Controller
                control={form.control}
                name="pedidoMinimoCentavos"
                render={({ field }) => (
                  <CampoDinheiro
                    id="venda-pedido-minimo"
                    valor={field.value}
                    onChange={(v) => field.onChange(v ?? Number.NaN)}
                  />
                )}
              />
            </Campo>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Preço da festa por pessoa (opcional)</p>
            <p className="text-muted-foreground text-sm">
              Para quem cobra a festa por pessoa conforme o número de convidados (ex.: até 90, R$
              45,00; até 120, R$ 40,00) e o cliente só escolhe o cardápio. Acima da maior faixa,
              vale a maior. Sem faixas, a festa é a soma dos itens.
            </p>
            <Controller
              control={form.control}
              name="faixasFestaPorPessoa"
              render={({ field }) => (
                <EditorFaixasPorPessoa
                  id="venda-faixa"
                  valor={field.value}
                  onChange={field.onChange}
                  erro={(c) => lerErro(e, `faixasFestaPorPessoa.${c}`)}
                />
              )}
            />
          </div>
        </div>
      )}
    </Secao>
  );
}

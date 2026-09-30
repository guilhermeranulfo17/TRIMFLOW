'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { CampoDinheiro } from '@/components/app/campos';
import { Campo, CampoCheck } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { classeCampo } from '@/components/app/form/estilos';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ROTULOS_COBRANCA } from '@/domain/catalogo/resumo';
import { dadosOpcionalSchema, type DadosOpcionalEntrada } from '@/domain/validacao/catalogo';
import { criarOpcional, salvarDadosOpcional } from '@/server/actions/empresa/opcionais';

const numeroOuNulo = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));

const DICAS_COBRANCA: Record<DadosOpcionalEntrada['cobranca'], string> = {
  por_pessoa: 'Multiplica pelo número de convidados.',
  fixo: 'Um valor único, não importa a quantidade de convidados.',
  por_unidade: 'O cliente escolhe a quantidade (ex.: 2 garçons extras).',
  por_hora: 'O cliente escolhe quantas horas.',
};

export function FormDadosOpcional({
  opcionalId,
  inicial,
  somenteLeitura,
}: {
  opcionalId: string | null;
  inicial: DadosOpcionalEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [salvando, iniciar] = useTransition();
  const form = useForm<DadosOpcionalEntrada>({
    resolver: zodResolver(dadosOpcionalSchema),
    defaultValues: inicial,
  });
  const e = form.formState.errors;
  const cobranca = form.watch('cobranca');
  const comQuantidade = cobranca === 'por_unidade' || cobranca === 'por_hora';

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r =
        opcionalId === null
          ? await criarOpcional(valores)
          : await salvarDadosOpcional(opcionalId, valores);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        form.reset(valores);
        const novoId = (r.dados as { id?: string } | undefined)?.id;
        if (opcionalId === null && novoId) router.push(`/app/empresa/catalogo/opcionais/${novoId}`);
        else router.refresh();
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <Secao
      id="dados"
      titulo="Dados e cobrança"
      descricao="O que é o opcional e como ele é cobrado."
      onSubmit={onSubmit}
      salvando={salvando}
      sujo={form.formState.isDirty}
      somenteLeitura={somenteLeitura}
      textoBotao={opcionalId ? 'Salvar' : 'Criar opcional'}
    >
      <Campo id="opcional-nome" rotulo="Nome do opcional" erro={e.nome?.message}>
        <Input
          id="opcional-nome"
          placeholder="Ex.: Mesa temática"
          aria-invalid={!!e.nome || undefined}
          {...form.register('nome')}
        />
      </Campo>
      <Campo id="opcional-descricao" rotulo="Descrição (opcional)" erro={e.descricao?.message}>
        <Textarea id="opcional-descricao" rows={3} {...form.register('descricao')} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="opcional-cobranca"
          rotulo="Cobrança"
          dica={DICAS_COBRANCA[cobranca]}
          erro={e.cobranca?.message}
        >
          <select id="opcional-cobranca" className={classeCampo} {...form.register('cobranca')}>
            {Object.entries(ROTULOS_COBRANCA).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="opcional-preco" rotulo="Preço" erro={e.precoCentavos?.message}>
          <Controller
            control={form.control}
            name="precoCentavos"
            render={({ field }) => (
              <CampoDinheiro
                id="opcional-preco"
                valor={Number.isFinite(field.value) ? field.value : null}
                onChange={(v) => field.onChange(v ?? Number.NaN)}
                invalido={!!e.precoCentavos}
                className="w-40"
              />
            )}
          />
        </Campo>
      </div>
      {comQuantidade && (
        <div className="grid grid-cols-2 gap-3">
          <Campo id="opcional-qtd-min" rotulo="Quantidade mínima" erro={e.qtdMin?.message}>
            <Input
              id="opcional-qtd-min"
              type="number"
              inputMode="numeric"
              min={0}
              {...form.register('qtdMin', { valueAsNumber: true })}
            />
          </Campo>
          <Campo
            id="opcional-qtd-max"
            rotulo="Quantidade máxima"
            dica="Vazio = sem limite"
            erro={e.qtdMax?.message}
          >
            <Input
              id="opcional-qtd-max"
              type="number"
              inputMode="numeric"
              min={0}
              {...form.register('qtdMax', { setValueAs: numeroOuNulo })}
            />
          </Campo>
        </div>
      )}
      <CampoCheck
        id="opcional-ativo"
        rotulo="Ativo"
        dica="Opcional inativo não aparece para o cliente."
        {...form.register('ativo')}
      />
    </Secao>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { CardsCatalogo, type CardCatalogo } from '@/components/app/empresa/cards-catalogo';
import { ListaConfig } from '@/components/app/empresa/lista-config';
import { Campo, CampoCheck } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { FormInline } from '@/components/app/form/form-inline';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { tipoEventoSchema, type TipoEventoEntrada } from '@/domain/validacao/catalogo';
import {
  alternarAtivoOpcional,
  duplicarOpcional,
  excluirOpcional,
  reordenarOpcionais,
} from '@/server/actions/empresa/opcionais';
import {
  alternarAtivoPacote,
  duplicarPacote,
  excluirPacote,
  reordenarPacotes,
} from '@/server/actions/empresa/pacotes';
import {
  excluirTipoEvento,
  reordenarTiposEvento,
  salvarTipoEvento,
} from '@/server/actions/empresa/tipos-evento';

type TipoItem = TipoEventoEntrada & { id: string; ativo: boolean };

function FormTipo({
  tipo,
  somenteLeitura,
  onFechar,
}: {
  tipo: TipoItem | null;
  somenteLeitura: boolean;
  onFechar: () => void;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<TipoEventoEntrada>({
    resolver: zodResolver(tipoEventoSchema),
    defaultValues: tipo ?? { nome: '', icone: '', ativo: true },
  });
  const e = form.formState.errors;
  const p = tipo?.id ?? 'novo';
  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await salvarTipoEvento(tipo?.id ?? null, valores);
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
      <Campo id={`tipo-nome-${p}`} rotulo="Nome do tipo de festa" erro={e.nome?.message}>
        <Input
          id={`tipo-nome-${p}`}
          placeholder="Ex.: Aniversário infantil"
          aria-invalid={!!e.nome || undefined}
          {...form.register('nome')}
        />
      </Campo>
      <CampoCheck
        id={`tipo-ativo-${p}`}
        rotulo="Ativo"
        dica="Tipo inativo não aparece para o cliente."
        {...form.register('ativo')}
      />
    </FormInline>
  );
}

export function ListaTipos({
  tipos,
  somenteLeitura,
}: {
  tipos: TipoItem[];
  somenteLeitura: boolean;
}) {
  return (
    <ListaConfig
      itens={tipos}
      nomeItem="tipo de festa"
      rotulo={(t) => t.nome}
      resumo={() => null}
      somenteLeitura={somenteLeitura}
      textoAdicionar="Adicionar tipo de festa"
      vazio={
        <p className="rounded-card text-muted-foreground border border-dashed px-4 py-6 text-center text-sm">
          Nenhum tipo de festa cadastrado. Ex.: aniversário infantil, 15 anos, casamento.
        </p>
      }
      renderForm={(item, fechar) => (
        <FormTipo tipo={item} somenteLeitura={somenteLeitura} onFechar={fechar} />
      )}
      onExcluir={excluirTipoEvento}
      onReordenar={reordenarTiposEvento}
      onAlternarAtivo={({ id, ativo, ...resto }) =>
        salvarTipoEvento(id, { ...resto, ativo: !ativo })
      }
    />
  );
}

export function CardsPacotes({
  pacotes,
  somenteLeitura,
}: {
  pacotes: CardCatalogo[];
  somenteLeitura: boolean;
}) {
  return (
    <CardsCatalogo
      itens={pacotes}
      nomeItem="pacote"
      comImagem
      hrefEditar={(id) => `/app/empresa/catalogo/pacotes/${id}`}
      somenteLeitura={somenteLeitura}
      onAlternarAtivo={alternarAtivoPacote}
      onDuplicar={duplicarPacote}
      onExcluir={excluirPacote}
      onReordenar={reordenarPacotes}
    />
  );
}

export function CardsOpcionais({
  opcionais,
  somenteLeitura,
}: {
  opcionais: CardCatalogo[];
  somenteLeitura: boolean;
}) {
  return (
    <CardsCatalogo
      itens={opcionais}
      nomeItem="opcional"
      hrefEditar={(id) => `/app/empresa/catalogo/opcionais/${id}`}
      somenteLeitura={somenteLeitura}
      onAlternarAtivo={alternarAtivoOpcional}
      onDuplicar={duplicarOpcional}
      onExcluir={excluirOpcional}
      onReordenar={reordenarOpcionais}
    />
  );
}

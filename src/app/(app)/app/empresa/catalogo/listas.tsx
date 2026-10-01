'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { CardsCatalogo, type CardCatalogo } from '@/components/app/empresa/cards-catalogo';
import { ListaConfig } from '@/components/app/empresa/lista-config';
import { Campo, CampoCheck } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { FormInline } from '@/components/app/form/form-inline';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { exemploAbertura, preencherAbertura, VARIAVEIS_ABERTURA } from '@/domain/proposta/abertura';
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

type TipoItem = Omit<TipoEventoEntrada, 'textoAbertura'> & {
  id: string;
  ativo: boolean;
  textoAbertura: string | null;
};

const TEXTO_PADRAO =
  'Olá, {nome}! Preparamos com carinho a proposta para {tipo} no dia {data}, para {convidados} convidados. Confira abaixo tudo o que está incluso e as condições para garantir a sua data no {buffet}.';

function FormTipo({
  tipo,
  somenteLeitura,
  onFechar,
  buffetNome,
}: {
  tipo: TipoItem | null;
  somenteLeitura: boolean;
  onFechar: () => void;
  buffetNome: string;
}) {
  const areaTexto = useRef<HTMLTextAreaElement | null>(null);
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<TipoEventoEntrada>({
    resolver: zodResolver(tipoEventoSchema),
    defaultValues: tipo
      ? { ...tipo, textoAbertura: tipo.textoAbertura ?? '' }
      : { nome: '', icone: '', ativo: true, textoAbertura: TEXTO_PADRAO },
  });
  const abertura = form.watch('textoAbertura') ?? '';
  const nomeTipo = form.watch('nome') || 'Aniversário infantil';
  const registroAbertura = form.register('textoAbertura');
  const inserir = (variavel: string) => {
    const el = areaTexto.current;
    const marca = `{${variavel}}`;
    const ini = el?.selectionStart ?? abertura.length;
    const fim = el?.selectionEnd ?? abertura.length;
    const novo = (abertura.slice(0, ini) + marca + abertura.slice(fim)).slice(0, 600);
    form.setValue('textoAbertura', novo, { shouldDirty: true });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  };
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
      <Campo
        id={`tipo-abertura-${p}`}
        rotulo="Texto de abertura da proposta"
        erro={e.textoAbertura?.message}
        dica={`${abertura.length}/600 · deixe vazio para não ter abertura`}
      >
        <Textarea
          id={`tipo-abertura-${p}`}
          rows={4}
          maxLength={600}
          {...registroAbertura}
          ref={(el) => {
            registroAbertura.ref(el);
            areaTexto.current = el;
          }}
        />
      </Campo>
      {!somenteLeitura && (
        <div className="flex flex-wrap gap-2" aria-label="Inserir variável">
          {VARIAVEIS_ABERTURA.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => inserir(v)}
              className="hover:bg-accent min-h-9 rounded-full border px-3 font-mono text-xs"
            >
              {`{${v}}`}
            </button>
          ))}
        </div>
      )}
      {abertura.trim() && (
        <div className="bg-muted/50 rounded-md p-3 text-sm" data-testid="previa-abertura">
          <p className="text-muted-foreground mb-1 text-xs font-semibold">Como fica na proposta</p>
          <p>{preencherAbertura(abertura, exemploAbertura(nomeTipo, buffetNome))}</p>
        </div>
      )}
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
  emUso,
  buffetNome,
}: {
  tipos: TipoItem[];
  somenteLeitura: boolean;
  emUso?: string[];
  buffetNome: string;
}) {
  return (
    <ListaConfig
      itens={tipos}
      emUso={emUso}
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
        <FormTipo
          tipo={item}
          somenteLeitura={somenteLeitura}
          onFechar={fechar}
          buffetNome={buffetNome}
        />
      )}
      onExcluir={excluirTipoEvento}
      onReordenar={reordenarTiposEvento}
      onAlternarAtivo={({ id, ativo, nome, icone }) =>
        salvarTipoEvento(id, { nome, icone, ativo: !ativo })
      }
    />
  );
}

export function CardsPacotes({
  pacotes,
  somenteLeitura,
  emUso,
}: {
  pacotes: CardCatalogo[];
  somenteLeitura: boolean;
  emUso?: string[];
}) {
  return (
    <CardsCatalogo
      itens={pacotes}
      emUso={emUso}
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
  emUso,
}: {
  opcionais: CardCatalogo[];
  somenteLeitura: boolean;
  emUso?: string[];
}) {
  return (
    <CardsCatalogo
      itens={opcionais}
      emUso={emUso}
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

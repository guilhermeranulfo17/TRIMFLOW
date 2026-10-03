'use client';

import { Check, Clock, Pencil, Sparkles, Trash2, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Folha } from '@/components/app/agenda/folha';
import { classeCampo } from '@/components/app/form/estilos';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { OPCOES_ADIAR, type OpcaoAdiar } from '@/domain/leads/adiar';
import type { SituacaoMensagem } from '@/domain/leads/mensagens';
import { cn } from '@/lib/utils';
import {
  adiarTarefa,
  apagarNota,
  atribuirResponsavel,
  cancelarVisita,
  concluirTarefa,
  confirmarVisita,
  editarNota,
  marcarVisitaRealizada,
  reabrirTarefa,
} from '@/server/actions/leads';
import { useAcao } from './acoes-lead';
import { CampoQuando } from './campo-quando';
import { BotaoWhatsApp } from './mensagem-pronta';

// ---------------------------------------------------------------------------
// Responsável: vendedor "Assumir"; dono atribui a qualquer usuário ativo
// ---------------------------------------------------------------------------
export function Responsavel({
  leadId,
  responsavel,
  usuarios,
  eu,
  ehDono,
}: {
  leadId: string;
  responsavel: { id: string; nome: string } | null;
  usuarios: { id: string; nome: string }[];
  eu: string;
  ehDono: boolean;
}) {
  const { executar, executando } = useAcao();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="responsavel">
      <span className="text-muted-foreground">Responsável:</span>
      <span className="font-semibold">{responsavel?.nome ?? 'Ninguém ainda'}</span>
      {ehDono ? (
        <select
          aria-label="Atribuir responsável"
          className={cn(classeCampo, 'h-9 w-auto')}
          value={responsavel?.id ?? ''}
          disabled={executando}
          onChange={(e) =>
            e.target.value && executar(() => atribuirResponsavel(leadId, e.target.value))
          }
        >
          <option value="" disabled>
            Atribuir…
          </option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      ) : (
        responsavel?.id !== eu && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={executando}
            onClick={() => executar(() => atribuirResponsavel(leadId, null))}
          >
            <UserCheck aria-hidden />
            Assumir
          </Button>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarefas (concluir com um toque, otimista; adiar)
// ---------------------------------------------------------------------------
export type TarefaVista = {
  id: string;
  titulo: string;
  quando: string;
  atrasada: boolean;
  feita: boolean;
  mensagemSugerida: string | null;
  responsavelNome: string | null;
  lead?: { id: string; nome: string; telefone: string };
  /** criada pelo follow-up automático (Etapa 7) */
  automatica?: { situacao: SituacaoMensagem; motivo: string } | null;
};

export function AdiarTarefa({
  tarefaId,
  aberto,
  onAbertoChange,
}: {
  tarefaId: string;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
}) {
  const { executar, executando, campos } = useAcao();
  const [quando, setQuando] = useState('');
  return (
    <Folha aberto={aberto} onAbertoChange={onAbertoChange} titulo="Adiar tarefa">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {OPCOES_ADIAR.map((o) => (
            <button
              key={o.chave}
              type="button"
              disabled={executando}
              onClick={() =>
                executar(
                  () => adiarTarefa(tarefaId, { opcao: o.chave as OpcaoAdiar }),
                  () => onAbertoChange(false),
                )
              }
              className="rounded-card hover:bg-accent min-h-12 border text-sm font-semibold"
            >
              {o.rotulo}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-sm">Ou escolha o dia e a hora:</p>
        <CampoQuando
          id={`adiar-${tarefaId}`}
          valor={quando}
          onChange={setQuando}
          erro={campos.quando}
          atalhos={[]}
        />
        <Button
          type="button"
          disabled={executando || !quando}
          onClick={() =>
            executar(
              () => adiarTarefa(tarefaId, { quando }),
              () => onAbertoChange(false),
            )
          }
        >
          Adiar para esse horário
        </Button>
      </div>
    </Folha>
  );
}

export function ItemTarefa({ tarefa, leadId }: { tarefa: TarefaVista; leadId: string }) {
  const toast = useToast();
  const [feita, setFeita] = useState(tarefa.feita);
  const [adiando, setAdiando] = useState(false);
  const [, iniciar] = useTransition();

  function concluir() {
    setFeita(true); // otimista
    iniciar(async () => {
      const r = await concluirTarefa(tarefa.id);
      if (r.ok) toast.sucesso(r.mensagem, { desfazer: reabrir });
      else {
        setFeita(false);
        toast.erro(r.erro);
      }
    });
  }

  function reabrir() {
    setFeita(false); // otimista
    iniciar(async () => {
      const r = await reabrirTarefa(tarefa.id);
      if (!r.ok) {
        setFeita(true);
        toast.erro(r.erro);
      }
    });
  }

  return (
    <li className="flex items-start gap-3 py-2" data-testid="tarefa">
      <button
        type="button"
        onClick={concluir}
        disabled={feita}
        aria-label={feita ? `Concluída: ${tarefa.titulo}` : `Concluir: ${tarefa.titulo}`}
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-full border-2',
          feita ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
        )}
      >
        {feita && <Check className="size-5" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        {tarefa.automatica && (
          <span
            className="bg-primary/10 text-primary-texto mb-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
            data-testid="selo-automatica"
          >
            <Sparkles className="size-3" aria-hidden />
            Automática · {tarefa.automatica.motivo}
          </span>
        )}
        <p
          className={cn('font-semibold break-words', feita && 'text-muted-foreground line-through')}
        >
          {tarefa.titulo}
        </p>
        <p
          className={cn(
            'text-sm',
            tarefa.atrasada && !feita ? 'text-erro font-semibold' : 'text-muted-foreground',
          )}
        >
          {tarefa.atrasada && !feita ? 'Atrasada · ' : ''}
          {tarefa.quando}
          {tarefa.responsavelNome ? ` · ${tarefa.responsavelNome}` : ''}
        </p>
        {tarefa.lead && (
          <Link
            href={`/app/leads/${tarefa.lead.id}`}
            className="text-muted-foreground hover:text-foreground text-sm font-semibold underline underline-offset-2"
          >
            {tarefa.lead.nome} · {tarefa.lead.telefone}
          </Link>
        )}
        {!feita && (
          <div className="mt-1 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdiando(true)}>
              <Clock aria-hidden />
              Adiar
            </Button>
            {(tarefa.mensagemSugerida || tarefa.automatica) && (
              <BotaoWhatsApp
                leadId={leadId}
                tarefaId={tarefa.id}
                textoInicial={tarefa.mensagemSugerida}
                situacaoInicial={tarefa.automatica?.situacao}
                rotulo="Enviar no WhatsApp"
                className="min-h-9 text-xs"
              />
            )}
          </div>
        )}
      </div>
      <AdiarTarefa tarefaId={tarefa.id} aberto={adiando} onAbertoChange={setAdiando} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Visitas
// ---------------------------------------------------------------------------
export type VisitaVista = {
  id: string;
  status: string;
  titulo: string;
  observacoes: string | null;
};

export function ItemVisita({ visita, leadId }: { visita: VisitaVista; leadId: string }) {
  const { executar, executando, campos } = useAcao();
  const [modo, setModo] = useState<'confirmar' | 'remarcar' | 'cancelar' | null>(null);
  const [quando, setQuando] = useState('');
  const [motivo, setMotivo] = useState('');
  const fechar = () => setModo(null);
  return (
    <li className="py-2" data-testid="visita">
      <p className="font-semibold">{visita.titulo}</p>
      {visita.observacoes && <p className="text-muted-foreground text-sm">{visita.observacoes}</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        {visita.status === 'solicitada' && (
          <Button type="button" size="sm" onClick={() => setModo('confirmar')}>
            Confirmar dia e hora
          </Button>
        )}
        {visita.status === 'confirmada' && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={executando}
              onClick={() => executar(() => marcarVisitaRealizada(visita.id, leadId))}
            >
              Realizada
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setModo('remarcar')}>
              Remarcar
            </Button>
          </>
        )}
        {(visita.status === 'solicitada' || visita.status === 'confirmada') && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setModo('cancelar')}>
            Cancelar
          </Button>
        )}
      </div>
      <Folha
        aberto={modo !== null}
        onAbertoChange={(v) => !v && fechar()}
        titulo={
          modo === 'cancelar'
            ? 'Cancelar visita'
            : modo === 'remarcar'
              ? 'Remarcar visita'
              : 'Confirmar visita'
        }
      >
        {modo === 'cancelar' ? (
          <div className="flex flex-col gap-3">
            <Input
              aria-label="Motivo (opcional)"
              placeholder="Motivo (opcional)"
              value={motivo}
              maxLength={300}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <Button
              type="button"
              variant="destructive"
              disabled={executando}
              onClick={() => executar(() => cancelarVisita(visita.id, leadId, motivo), fechar)}
            >
              Cancelar visita
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <CampoQuando
              id={`visita-${visita.id}`}
              valor={quando}
              onChange={setQuando}
              erro={campos.quando}
              atalhos={['amanhã 10h', 'amanhã 15h', 'em 2 dias 10h', 'em 2 dias 15h']}
            />
            <Button
              type="button"
              disabled={executando || !quando}
              onClick={() =>
                executar(
                  () => confirmarVisita(visita.id, leadId, { quando }, modo === 'remarcar'),
                  fechar,
                )
              }
            >
              {modo === 'remarcar' ? 'Remarcar' : 'Confirmar visita'}
            </Button>
          </div>
        )}
      </Folha>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Linha do tempo unificada (com o filtro "só notas")
// ---------------------------------------------------------------------------
export type ItemTempo = {
  id: string;
  texto: string;
  quando: string;
  nota?: { id: string; texto: string; podeEditar: boolean; podeApagar: boolean; editada: boolean };
};

function Nota({ nota, leadId }: { nota: NonNullable<ItemTempo['nota']>; leadId: string }) {
  const { executar, executando } = useAcao();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nota.texto);
  if (editando) {
    return (
      <div className="mt-1 flex flex-col gap-2">
        <Textarea
          aria-label="Editar nota"
          rows={3}
          maxLength={2000}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={executando || !texto.trim()}
            onClick={() =>
              executar(
                () => editarNota(nota.id, leadId, { texto }),
                () => setEditando(false),
              )
            }
          >
            Salvar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
            Desistir
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-muted/50 mt-1 rounded-md p-2">
      <p className="text-sm whitespace-pre-wrap">{nota.texto}</p>
      {(nota.podeEditar || nota.podeApagar || nota.editada) && (
        <div className="mt-1 flex items-center gap-1">
          {nota.editada && <span className="text-muted-foreground mr-auto text-xs">editada</span>}
          {nota.podeEditar && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Editar nota"
              onClick={() => setEditando(true)}
            >
              <Pencil aria-hidden />
            </Button>
          )}
          {nota.podeApagar && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Apagar nota"
              disabled={executando}
              onClick={() => executar(() => apagarNota(nota.id, leadId))}
            >
              <Trash2 aria-hidden />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function LinhaDoTempo({ itens, leadId }: { itens: ItemTempo[]; leadId: string }) {
  const [soNotas, setSoNotas] = useState(false);
  const visiveis = soNotas ? itens.filter((i) => i.nota) : itens;
  return (
    <section aria-labelledby="titulo-tempo">
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-tempo" className="font-bold">
          Linha do tempo
        </h2>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-5"
            checked={soNotas}
            onChange={(e) => setSoNotas(e.target.checked)}
          />
          Só notas
        </label>
      </div>
      {visiveis.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">
          {soNotas
            ? 'Nenhuma nota ainda. Use ⋯ → Nota para anotar algo do cliente.'
            : 'Nada por aqui ainda.'}
        </p>
      ) : (
        <ol className="mt-2 flex flex-col gap-3 border-l pl-4" data-testid="linha-do-tempo">
          {visiveis.map((i) => (
            <li key={i.id} className="relative text-sm">
              <span
                className="bg-primary absolute top-1.5 -left-[21px] size-2 rounded-full"
                aria-hidden
              />
              <span className="block">{i.texto}</span>
              <span className="text-muted-foreground text-xs">{i.quando}</span>
              {i.nota && <Nota nota={i.nota} leadId={leadId} />}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

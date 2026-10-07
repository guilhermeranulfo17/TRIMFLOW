'use client';

import { AlarmClock, ArrowRightLeft, ChevronDown, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Folha } from '@/components/app/agenda/folha';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import {
  acaoDoMovimento,
  destinosDoCard,
  ETAPAS_FUNIL,
  ROTULO_ETAPA,
  type EtapaFunil,
} from '@/domain/leads/funil';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import { reabrirLead } from '@/server/actions/leads';
import { preReservarOrcamento } from '@/server/actions/orcamentos';
import type { CardFunil, ColunaFunil } from '@/server/leads/funil';
import { FormPerdido } from './acoes-lead';
import { Iniciais, Temperatura } from './indicadores';
import { FolhaRegistrarContato } from './registrar-contato';

/*
 * Funil de leads (Etapa 13). PC: colunas lado a lado, arrastar o card (arrastar nativo do
 * navegador, sem biblioteca). Celular: abas por etapa e "Mover para" em cada card. Mover nunca
 * troca o status direto: abre a ação de verdade (domain/leads/funil, acaoDoMovimento).
 */

type Pendente =
  | { tipo: 'contato'; card: CardFunil }
  | { tipo: 'perder'; card: CardFunil }
  | { tipo: 'pre_reservar'; card: CardFunil; orcamentoId: string }
  | { tipo: 'mover'; card: CardFunil }
  | null;

const ARRASTO = 'application/x-orkestra-lead';

function Card({
  card,
  podeMover,
  onMover,
}: {
  card: CardFunil;
  podeMover: boolean;
  onMover: () => void;
}) {
  return (
    <li
      className="bg-card rounded-card relative border p-3 transition-shadow hover:shadow-sm"
      draggable={podeMover}
      onDragStart={(e) => {
        e.dataTransfer.setData(ARRASTO, card.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      data-testid="card-funil"
      data-lead={card.id}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/app/leads/${card.id}`}
          className="min-w-0 font-semibold break-words after:absolute after:inset-0"
        >
          {card.nome}
        </Link>
        <Temperatura temperatura={card.temperatura} comTexto={false} />
      </div>
      {card.festa && <p className="text-muted-foreground mt-0.5 text-sm">{card.festa}</p>}
      {card.passo && (
        <p
          className={cn(
            'mt-1 flex items-center gap-1 text-sm',
            card.passo.atrasado ? 'text-erro font-semibold' : 'text-muted-foreground',
          )}
        >
          {card.passo.atrasado && <AlarmClock className="size-3.5 shrink-0" aria-hidden />}
          <span className="min-w-0 truncate">{card.passo.texto}</span>
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {card.totalCentavos != null ? formatBRL(card.totalCentavos) : ''}
        </span>
        <span className="flex items-center gap-1.5">
          {card.ehTeste && (
            <span className="bg-alerta/15 text-alerta rounded-full px-2 py-0.5 text-xs font-semibold">
              Teste
            </span>
          )}
          {card.responsavel && (
            <Iniciais nome={card.responsavel.nome} iniciais={card.responsavel.iniciais} />
          )}
          {podeMover && (
            // no celular não se arrasta: "Mover para" abre as etapas possíveis
            <button
              type="button"
              onClick={onMover}
              className="hover:bg-accent relative z-10 inline-flex size-9 items-center justify-center rounded-full border md:hidden"
              aria-label={`Mover ${card.nome} para outra etapa`}
              data-testid="mover-card"
            >
              <ArrowRightLeft className="size-4" aria-hidden />
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

function Cabecalho({ coluna }: { coluna: ColunaFunil }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h2 className="text-sm font-bold">
        {ROTULO_ETAPA[coluna.etapa]}{' '}
        <span className="text-muted-foreground font-normal tabular-nums">{coluna.total}</span>
      </h2>
      {coluna.etapa !== 'perdido' && coluna.somaCentavos > 0 && (
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatBRL(coluna.somaCentavos)}
        </span>
      )}
    </div>
  );
}

function Lista({
  coluna,
  podeMover,
  onMover,
  classeLista,
}: {
  coluna: ColunaFunil;
  podeMover: boolean;
  onMover: (c: CardFunil) => void;
  classeLista?: string;
}) {
  if (coluna.cards.length === 0) {
    return (
      <p className="text-muted-foreground rounded-card border border-dashed p-4 text-center text-sm">
        Nenhum lead aqui.
      </p>
    );
  }
  return (
    <>
      <ul className={cn('flex flex-col gap-2', classeLista)}>
        {coluna.cards.map((c) => (
          <Card key={c.id} card={c} podeMover={podeMover} onMover={() => onMover(c)} />
        ))}
      </ul>
      {coluna.total > coluna.cards.length && (
        <p className="text-muted-foreground px-1 text-xs">
          Mostrando os {coluna.cards.length} mais recentes de {coluna.total}. Use a busca ou os
          filtros para achar os outros.
        </p>
      )}
    </>
  );
}

export function FunilLeads({
  colunas,
  somenteLeitura,
}: {
  colunas: ColunaFunil[];
  somenteLeitura: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [aba, setAba] = useState<EtapaFunil>('novo');
  const [pendente, setPendente] = useState<Pendente>(null);
  const [sobre, setSobre] = useState<EtapaFunil | null>(null);
  const [perdidosAbertos, setPerdidosAbertos] = useState(false);
  const [executando, iniciar] = useTransition();
  const podeMover = !somenteLeitura;
  const porEtapa = new Map(colunas.map((c) => [c.etapa, c]));
  const todos = new Map(colunas.flatMap((c) => c.cards.map((k) => [k.id, k] as const)));
  const fechar = () => setPendente(null);

  function mover(card: CardFunil, para: EtapaFunil) {
    const a = acaoDoMovimento(card, para);
    switch (a.tipo) {
      case 'nada':
        return;
      case 'bloqueado':
        toast.erro(a.mensagem);
        return;
      case 'ir':
        toast.sucesso(a.aviso);
        router.push(a.href);
        return;
      case 'contato':
        setPendente({ tipo: 'contato', card });
        return;
      case 'perder':
        setPendente({ tipo: 'perder', card });
        return;
      case 'pre_reservar':
        setPendente({ tipo: 'pre_reservar', card, orcamentoId: a.orcamentoId });
        return;
      case 'reabrir':
        iniciar(async () => {
          const r = await reabrirLead(card.id);
          if (r.ok) {
            toast.sucesso(r.mensagem || 'Lead reaberto.');
            router.refresh();
          } else toast.erro(r.erro);
        });
        return;
    }
  }

  function preReservar(orcamentoId: string) {
    iniciar(async () => {
      const r = await preReservarOrcamento(orcamentoId);
      if (r.ok) {
        toast.sucesso('Pré-reserva feita. Está na Agenda.');
        fechar();
        router.refresh();
      } else toast.erro(r.erro);
    });
  }

  const alvo = (etapa: EtapaFunil) =>
    podeMover
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes(ARRASTO)) return;
            e.preventDefault();
            setSobre(etapa);
          },
          onDragLeave: () => setSobre((s) => (s === etapa ? null : s)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setSobre(null);
            const card = todos.get(e.dataTransfer.getData(ARRASTO));
            if (card) mover(card, etapa);
          },
        }
      : {};

  const perdidos = porEtapa.get('perdido')!;

  const moverNoCelular = (card: CardFunil) => setPendente({ tipo: 'mover', card });

  // Uma estrutura só para os dois tamanhos: no celular aparece só a coluna da aba escolhida.
  return (
    <div className="flex flex-col gap-3" aria-busy={executando || undefined} data-testid="funil">
      <div
        role="tablist"
        aria-label="Etapas do funil"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden"
      >
        {([...ETAPAS_FUNIL, 'perdido'] as EtapaFunil[]).map((e) => (
          <button
            key={e}
            type="button"
            role="tab"
            aria-selected={aba === e}
            onClick={() => setAba(e)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold',
              aba === e ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent',
            )}
            data-testid={`aba-${e}`}
          >
            {ROTULO_ETAPA[e]}
            <span className={cn('text-xs tabular-nums', aba !== e && 'text-muted-foreground')}>
              {porEtapa.get(e)!.total}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 md:grid md:grid-cols-5">
        {ETAPAS_FUNIL.map((e) => (
          <section
            key={e}
            aria-label={ROTULO_ETAPA[e]}
            className={cn(
              'md:bg-muted/40 md:rounded-card flex min-w-0 flex-col gap-2 transition-colors md:p-2',
              e !== aba && 'max-md:hidden',
              sobre === e && 'bg-primary/10 ring-primary ring-2',
            )}
            data-testid={`coluna-${e}`}
            {...alvo(e)}
          >
            <Cabecalho coluna={porEtapa.get(e)!} />
            {/* no PC, rolagem própria: a faixa dos perdidos fica sempre à vista para soltar */}
            <div className="flex flex-col gap-2 md:-mx-1 md:max-h-[62dvh] md:overflow-y-auto md:px-1 md:pb-1">
              <Lista coluna={porEtapa.get(e)!} podeMover={podeMover} onMover={moverNoCelular} />
            </div>
          </section>
        ))}
      </div>

      <section
        aria-label={ROTULO_ETAPA.perdido}
        className={cn(
          'md:bg-muted/40 md:rounded-card flex flex-col gap-2 transition-colors md:p-2',
          aba !== 'perdido' && 'max-md:hidden',
          sobre === 'perdido' && 'bg-erro/10 ring-erro ring-2',
        )}
        data-testid="coluna-perdido"
        {...alvo('perdido')}
      >
        <div className="md:hidden">
          <Cabecalho coluna={perdidos} />
        </div>
        <button
          type="button"
          className="hidden min-h-11 items-center justify-between gap-2 px-1 text-left md:flex"
          aria-expanded={perdidosAbertos}
          onClick={() => setPerdidosAbertos((v) => !v)}
        >
          <span className="text-sm font-bold">
            {ROTULO_ETAPA.perdido}{' '}
            <span className="text-muted-foreground font-normal tabular-nums">{perdidos.total}</span>
          </span>
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            {podeMover && 'Solte aqui para marcar perdido'}
            <ChevronDown
              className={cn('size-4 transition-transform', perdidosAbertos && 'rotate-180')}
              aria-hidden
            />
          </span>
        </button>
        <div className={cn('flex flex-col gap-2', !perdidosAbertos && 'md:hidden')}>
          <Lista
            coluna={perdidos}
            podeMover={podeMover}
            onMover={moverNoCelular}
            classeLista="md:grid md:grid-cols-5"
          />
        </div>
      </section>

      <Folha
        aberto={pendente?.tipo === 'mover'}
        onAbertoChange={(v) => !v && fechar()}
        titulo={pendente ? `Mover ${pendente.card.nome}` : ''}
      >
        {pendente?.tipo === 'mover' && (
          <div className="flex flex-col gap-2" data-testid="destinos">
            {destinosDoCard(pendente.card).map((e) => (
              <Button
                key={e}
                type="button"
                variant={e === 'perdido' ? 'destructive' : 'outline'}
                size="lg"
                onClick={() => {
                  const card = pendente.card;
                  fechar();
                  mover(card, e);
                }}
              >
                {ROTULO_ETAPA[e]}
              </Button>
            ))}
            {destinosDoCard(pendente.card).length === 0 && (
              <p className="text-muted-foreground text-sm">
                A reserva está confirmada. Para mudar, cancele a reserva na Agenda.
              </p>
            )}
          </div>
        )}
      </Folha>

      <FolhaRegistrarContato
        leadId={pendente?.tipo === 'contato' ? pendente.card.id : ''}
        aberto={pendente?.tipo === 'contato'}
        onAbertoChange={(v) => !v && fechar()}
        onOk={() => router.refresh()}
      />

      <Folha
        aberto={pendente?.tipo === 'perder'}
        onAbertoChange={(v) => !v && fechar()}
        titulo="Marcar como perdido"
      >
        {pendente?.tipo === 'perder' && (
          <FormPerdido
            leadId={pendente.card.id}
            temPreReserva={pendente.card.status === 'pre_reservado'}
            fechar={fechar}
          />
        )}
      </Folha>

      <Folha
        aberto={pendente?.tipo === 'pre_reservar'}
        onAbertoChange={(v) => !v && !executando && fechar()}
        titulo="Pré-reservar a data?"
        descricao="A data da proposta fica segura na Agenda pelo prazo das suas regras."
      >
        {pendente?.tipo === 'pre_reservar' && (
          <Button
            type="button"
            size="lg"
            disabled={executando}
            onClick={() => preReservar(pendente.orcamentoId)}
            data-testid="confirmar-pre-reserva"
          >
            {executando && <Loader2 className="animate-spin" aria-hidden />}
            Pré-reservar
          </Button>
        )}
      </Folha>
    </div>
  );
}

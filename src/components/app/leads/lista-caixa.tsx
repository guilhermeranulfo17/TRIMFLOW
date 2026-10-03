'use client';

import { AlarmClock, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import type { FiltrosCaixa } from '@/domain/leads/filtros';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import { carregarMaisLeads } from '@/server/actions/leads';
import type { CartaoLead, CursorCaixa, PaginaCaixa } from '@/server/leads/carregar';
import { Iniciais, SeloStatus, Temperatura } from './indicadores';
import { BotaoWhatsApp } from './mensagem-pronta';
import { BotaoRegistrarContato } from './registrar-contato';

/** Ponto colorido do motivo: a cor diz por que o lead está nessa posição da caixa. */
const COR_GRUPO: Record<number, string> = {
  1: 'bg-alerta',
  2: 'bg-info',
  3: 'bg-erro',
  4: 'bg-quente',
  5: 'bg-info',
  6: 'bg-zinc-400',
};

function Cartao({ lead }: { lead: CartaoLead }) {
  // Registrar contato é otimista: o cartão já mostra o resultado; se o servidor recusar, volta.
  const [registrado, setRegistrado] = useState(false);
  const status =
    registrado && ['novo', 'abandonou', 'frio'].includes(lead.status)
      ? 'em_andamento'
      : lead.status;
  const motivo = registrado ? 'Contato registrado agora' : lead.motivo;
  return (
    <li
      className="bg-card rounded-card hover:bg-accent/60 relative p-4 transition-colors"
      data-testid="card-lead"
      data-grupo={lead.grupo}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/app/leads/${lead.id}`}
              className="font-bold break-words after:absolute after:inset-0"
            >
              {lead.nome}
            </Link>
            <SeloStatus status={status} />
            {lead.ehTeste && (
              <span className="bg-alerta/15 text-alerta rounded-full px-2 py-0.5 text-xs font-semibold">
                Teste
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold" data-testid="motivo">
            <span
              className={cn('size-2 shrink-0 rounded-full', COR_GRUPO[lead.grupo] ?? 'bg-border')}
              aria-hidden
            />
            <Temperatura temperatura={lead.temperatura} comTexto={false} />
            {motivo}
            {lead.temAtrasada && lead.grupo !== 3 && (
              <AlarmClock className="text-erro size-3.5" aria-label="Tem tarefa atrasada" />
            )}
          </p>
          {lead.festa && <p className="text-muted-foreground mt-0.5 text-sm">{lead.festa}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {lead.totalCentavos != null && (
            <span className="text-base font-light tracking-tight tabular-nums">
              {formatBRL(lead.totalCentavos)}
            </span>
          )}
          {lead.responsavel && (
            <Iniciais nome={lead.responsavel.nome} iniciais={lead.responsavel.iniciais} />
          )}
        </div>
      </div>
      <div className="relative z-10 mt-3 grid grid-cols-2 gap-2">
        <BotaoWhatsApp leadId={lead.id} />
        <BotaoRegistrarContato
          leadId={lead.id}
          onOtimista={() => setRegistrado(true)}
          onVolta={() => setRegistrado(false)}
        />
      </div>
    </li>
  );
}

/** Lista priorizada (ordem do servidor) com "Carregar mais" por cursor. */
export function ListaCaixa({ inicial, filtros }: { inicial: PaginaCaixa; filtros: FiltrosCaixa }) {
  const toast = useToast();
  const [cartoes, setCartoes] = useState<CartaoLead[]>(inicial.cartoes);
  const [cursor, setCursor] = useState<CursorCaixa>(inicial.cursor);
  const [carregando, iniciar] = useTransition();

  function carregarMais() {
    if (!cursor) return;
    iniciar(async () => {
      const r = await carregarMaisLeads(filtros, cursor);
      if (!r.ok || !r.dados) {
        toast.erro(r.ok ? 'Não foi possível carregar mais.' : r.erro);
        return;
      }
      const vistos = new Set(cartoes.map((c) => c.id));
      setCartoes((atual) => [...atual, ...r.dados!.cartoes.filter((c) => !vistos.has(c.id))]);
      setCursor(r.dados.cursor);
    });
  }

  if (cartoes.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center" data-testid="caixa-vazia">
        Nenhum lead com esses filtros.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2" data-testid="lista-leads">
        {cartoes.map((c) => (
          <Cartao key={c.id} lead={c} />
        ))}
      </ul>
      {cursor && (
        <button
          type="button"
          onClick={carregarMais}
          disabled={carregando}
          className="rounded-control hover:bg-accent mx-auto mt-2 inline-flex min-h-11 items-center gap-2 border px-5 text-sm font-semibold"
        >
          {carregando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Carregar mais
        </button>
      )}
    </>
  );
}

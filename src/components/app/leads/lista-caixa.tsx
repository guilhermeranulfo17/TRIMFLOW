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

const COR_GRUPO: Record<number, string> = {
  1: 'border-l-amber-500',
  2: 'border-l-violet-500',
  3: 'border-l-rose-500',
  4: 'border-l-orange-400',
  5: 'border-l-sky-500',
  6: 'border-l-zinc-400',
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
      className={cn(
        'bg-card rounded-card relative border border-l-4 p-3',
        COR_GRUPO[lead.grupo] ?? 'border-l-transparent',
      )}
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
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                Teste
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold" data-testid="motivo">
            <Temperatura temperatura={lead.temperatura} comTexto={false} />
            {motivo}
            {lead.temAtrasada && lead.grupo !== 3 && (
              <AlarmClock className="size-3.5 text-rose-600" aria-label="Tem tarefa atrasada" />
            )}
          </p>
          {lead.festa && <p className="text-muted-foreground mt-0.5 text-sm">{lead.festa}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {lead.totalCentavos != null && (
            <span className="text-sm font-bold tabular-nums">{formatBRL(lead.totalCentavos)}</span>
          )}
          {lead.responsavel && (
            <Iniciais nome={lead.responsavel.nome} iniciais={lead.responsavel.iniciais} />
          )}
        </div>
      </div>
      <div className="relative z-10 mt-2 grid grid-cols-2 gap-2">
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

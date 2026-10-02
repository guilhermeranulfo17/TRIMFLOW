'use client';

import { CalendarCheck, CircleCheck, Copy, Download, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useToast } from '@/components/app/toast';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { Button } from '@/components/ui/button';
import { formatDataHora } from '@/domain/dates';
import { numeroProposta } from '@/domain/proposta/arquivo';
import {
  marcarOrcamentoEnviado,
  preReservarOrcamento,
  type OrcamentoSalvo,
} from '@/server/actions/orcamentos';

const ACAO =
  'rounded-control inline-flex min-h-12 w-full items-center justify-center gap-2 border px-4 font-semibold transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

/** Depois de salvar: enviar pelo WhatsApp, copiar o link, baixar o PDF ou pré-reservar. */
export function SaidasOrcamento({
  salvo,
  cliente,
  fuso,
  podePreReservar,
}: {
  salvo: OrcamentoSalvo;
  cliente: string;
  fuso: string;
  podePreReservar: boolean;
}) {
  const toast = useToast();
  const [reservando, setReservando] = useState(false);
  const [reservadoAte, setReservadoAte] = useState<string | null>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(salvo.link);
      toast.sucesso('Link copiado.');
      void marcarOrcamentoEnviado(salvo.id, 'link');
    } catch {
      toast.erro('Não deu para copiar. Segure o link para copiar.');
    }
  }

  async function preReservar() {
    setReservando(true);
    const r = await preReservarOrcamento(salvo.id);
    setReservando(false);
    if (r.ok) {
      setReservadoAte(r.dados.expiraEm);
      toast.sucesso('Pré-reserva feita.');
    } else toast.erro(r.erro);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4" data-testid="saidas-orcamento">
      <div className="bg-card rounded-card border p-5 text-center">
        <CircleCheck className="text-primary mx-auto size-10" aria-hidden />
        <h2 className="mt-2 text-xl font-extrabold">
          Orçamento nº {numeroProposta(salvo.numero)}
          {salvo.versao > 1 ? ` · versão ${salvo.versao}` : ''} salvo
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">Agora envie a proposta para {cliente}.</p>
        <p className="mt-3 truncate text-sm" title={salvo.link}>
          <a
            href={salvo.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-semibold underline-offset-2 hover:underline"
            data-testid="link-proposta"
          >
            {salvo.link.replace(/^https?:\/\//, '')}
          </a>
        </p>
      </div>

      {salvo.linkWhatsapp && (
        <a
          href={salvo.linkWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => void marcarOrcamentoEnviado(salvo.id, 'whatsapp')}
          className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 font-bold"
        >
          <IconeWhatsApp />
          Enviar pelo WhatsApp
        </a>
      )}
      <button type="button" className={ACAO} onClick={() => void copiar()}>
        <Copy className="size-4" aria-hidden />
        Copiar link
      </button>
      <a
        href={salvo.pdf}
        className={ACAO}
        onClick={() => void marcarOrcamentoEnviado(salvo.id, 'pdf')}
        data-testid="baixar-pdf-interno"
      >
        <Download className="size-4" aria-hidden />
        Baixar PDF
      </a>
      {reservadoAte ? (
        <p
          className="rounded-control bg-primary/10 text-primary p-3 text-center text-sm font-semibold"
          role="status"
        >
          Pré-reservado até {formatDataHora(reservadoAte, fuso)}. Está na Agenda.
        </p>
      ) : (
        podePreReservar && (
          <button
            type="button"
            className={ACAO}
            onClick={() => void preReservar()}
            disabled={reservando}
          >
            {reservando ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <CalendarCheck className="size-4" aria-hidden />
            )}
            Pré-reservar a data
          </button>
        )
      )}

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="ghost" className="flex-1">
          <Link href={`/app/leads/${salvo.leadId}`}>Ver no lead</Link>
        </Button>
        <Button asChild variant="ghost" className="flex-1">
          <a href="/app/orcamentos/novo">
            <Plus aria-hidden />
            Novo orçamento
          </a>
        </Button>
      </div>
    </div>
  );
}

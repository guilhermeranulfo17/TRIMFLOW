'use client';

import { Ban, Copy, Download, Eye, Link2, Loader2, RefreshCw, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { PendenteLink } from '@/components/app/pendente-link';
import { useToast } from '@/components/app/toast';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { acoesDoContrato } from '@/domain/contratos/painel';
import type { StatusContrato } from '@/domain/contratos/estados';
import { formatData } from '@/domain/dates';
import {
  cancelarContratoAcao,
  novoLinkContrato,
  verCpfContrato,
  type LinkNovo,
} from '@/server/actions/contratos';

/*
 * Ações do detalhe do contrato (Etapa 10, PR 2). O link do cliente nunca fica guardado (só o
 * hash), então "reenviar" sempre gera um link novo e o anterior para de abrir. Refazer = gerar
 * outro contrato a partir do orçamento (o atual é cancelado ao enviar o novo).
 */

const ACAO =
  'rounded-control inline-flex min-h-11 items-center justify-center gap-2 border px-4 text-sm font-semibold transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50';

export function AcoesContrato(p: {
  id: string;
  codigo: string;
  status: StatusContrato;
  orcamentoId: string | null;
  somenteLeitura: boolean;
}) {
  const a = acoesDoContrato(p.status);
  const toast = useToast();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [link, setLink] = useState<LinkNovo | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');

  function gerarLink() {
    iniciar(async () => {
      const r = await novoLinkContrato(p.id, 14);
      if (r.ok && r.dados) {
        setLink(r.dados);
        toast.sucesso(r.mensagem);
        router.refresh();
      } else if (!r.ok) toast.erro(r.erro);
    });
  }

  function cancelar() {
    iniciar(async () => {
      const r = await cancelarContratoAcao(p.id, motivo);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        setCancelando(false);
        setLink(null);
        router.refresh();
      } else toast.erro(r.erro);
    });
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.link);
      toast.sucesso('Link copiado.');
    } catch {
      toast.erro('Não deu para copiar. Segure o link para copiar.');
    }
  }

  const refazerHref = p.orcamentoId
    ? `/app/contratos/novo?orcamento=${p.orcamentoId}&substitui=${p.id}`
    : null;
  const nada = !a.pdf && !a.reenviar && !a.novoLink && !a.cancelar && !(a.refazer && refazerHref);
  if (nada) return null;

  return (
    <section
      aria-label="Ações do contrato"
      className="bg-card rounded-card flex flex-col gap-3 border p-4"
      data-testid="acoes-contrato"
    >
      {link && (
        <div
          className="bg-sucesso/10 border-sucesso/30 rounded-control flex flex-col gap-2 border p-3"
          data-testid="link-novo"
        >
          <p className="text-sm font-semibold">
            Link novo pronto (vale até {formatData(link.expiraEm)}). O anterior parou de abrir.
          </p>
          <p className="truncate text-sm" title={link.link}>
            <a
              href={link.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-texto font-semibold underline-offset-2 hover:underline"
              data-testid="link-contrato"
            >
              {link.link.replace(/^https?:\/\//, '')}
            </a>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {link.linkWhatsapp && (
              <a
                href={link.linkWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold"
              >
                <IconeWhatsApp />
                Lembrar pelo WhatsApp
              </a>
            )}
            <button type="button" className={`${ACAO} flex-1`} onClick={() => void copiar()}>
              <Copy className="size-4" aria-hidden />
              Copiar link
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {a.pdf && (
          // download: nada de <Link> (o prefetch baixaria o PDF)
          <a
            href={`/app/contratos/${p.id}/pdf`}
            className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold"
            data-testid="baixar-pdf-contrato"
          >
            <Download className="size-4" aria-hidden />
            Baixar PDF assinado
          </a>
        )}
        {(a.reenviar || a.novoLink) && !p.somenteLeitura && (
          <button
            type="button"
            className={ACAO}
            onClick={gerarLink}
            disabled={pendente}
            data-testid="novo-link-contrato"
          >
            {pendente ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : a.novoLink ? (
              <Link2 className="size-4" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {a.novoLink ? 'Gerar link novo' : 'Lembrar o cliente (link novo)'}
          </button>
        )}
        {a.refazer && refazerHref && !p.somenteLeitura && (
          <Link href={refazerHref} className={ACAO} data-testid="refazer-contrato">
            <RefreshCw className="size-4" aria-hidden />
            Refazer contrato
            <PendenteLink />
          </Link>
        )}
        {a.cancelar && !p.somenteLeitura && (
          <button
            type="button"
            className={`${ACAO} text-erro`}
            onClick={() => setCancelando(true)}
            disabled={pendente}
            data-testid="cancelar-contrato"
          >
            <Ban className="size-4" aria-hidden />
            Cancelar contrato
          </button>
        )}
      </div>

      <Dialog open={cancelando} onOpenChange={(v) => !pendente && setCancelando(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar o contrato {p.codigo}?</DialogTitle>
            <DialogDescription>
              O link para de funcionar e o cliente não consegue mais assinar. O contrato fica
              guardado como cancelado.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-semibold">
            Motivo (opcional, só o buffet vê)
            <input
              className="rounded-control border-input bg-background focus-visible:ring-ring/50 mt-1 block h-11 w-full border px-3 text-base font-normal focus-visible:ring-[3px] focus-visible:outline-none"
              value={motivo}
              maxLength={300}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pendente}
              onClick={() => setCancelando(false)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pendente}
              onClick={cancelar}
              data-testid="confirmar-cancelar-contrato"
            >
              {pendente && <Loader2 className="animate-spin" aria-hidden />}
              Cancelar contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** "Ver CPF completo": só o dono, fica no histórico do contrato. */
export function VerCpf({ id }: { id: string }) {
  const toast = useToast();
  const [cpf, setCpf] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  if (cpf) {
    return (
      <span className="font-semibold tabular-nums" data-testid="cpf-completo">
        {cpf}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="text-primary-texto inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold underline-offset-2 hover:underline"
      onClick={() =>
        iniciar(async () => {
          const r = await verCpfContrato(id);
          if (r.ok && r.dados) setCpf(r.dados.cpf);
          else if (!r.ok) toast.erro(r.erro);
        })
      }
      disabled={pendente}
      data-testid="ver-cpf"
    >
      {pendente ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Eye className="size-4" aria-hidden />
      )}
      Ver CPF completo
    </button>
  );
}

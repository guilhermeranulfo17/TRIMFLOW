'use client';

import { CalendarCheck, Copy, Download, ExternalLink, FilePen, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/app/toast';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { formatData } from '@/domain/dates';
import { resumoDaFesta } from '@/domain/leads';
import { formatBRL } from '@/domain/money';
import { numeroProposta } from '@/domain/proposta/arquivo';
import { marcarOrcamentoEnviado, preReservarOrcamento } from '@/server/actions/orcamentos';
import type { GrupoOrcamento, VersaoDoLead } from '@/server/leads/carregar';

const STATUS: Record<string, string> = {
  em_montagem: 'Em montagem',
  enviado: 'Enviado',
  visualizado: 'Visualizado',
  aceito: 'Pré-reservado',
  expirado: 'Expirado',
  substituido: 'Substituído',
};

function rotuloStatus(v: VersaoDoLead): string {
  if (v.status === 'visualizado' || (v.aberturas > 0 && v.status === 'enviado'))
    return `Visualizado ${v.aberturas}×`;
  if (v.validade?.expirada && v.status !== 'aceito' && v.status !== 'substituido')
    return 'Expirado';
  return STATUS[v.status] ?? v.status;
}

const ACAO =
  'rounded-control inline-flex min-h-11 items-center justify-center gap-1.5 border px-3 text-sm font-semibold hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50';

function Itens({ v }: { v: VersaoDoLead }) {
  return (
    <ul className="mt-2 divide-y">
      {v.itens.map((i, n) => (
        <li key={n} className="flex justify-between gap-2 py-1">
          <span className="min-w-0">
            {i.descricao}
            {i.detalhe && <span className="text-muted-foreground block text-xs">{i.detalhe}</span>}
          </span>
          <span className="shrink-0 tabular-nums">{formatBRL(i.subtotalCentavos)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Orçamentos do lead: a versão vigente com as ações e as anteriores com o que mudou. */
export function OrcamentosDoLead({ grupos }: { grupos: GrupoOrcamento[] }) {
  const toast = useToast();
  const router = useRouter();
  const [reservando, setReservando] = useState<string | null>(null);

  async function copiar(v: VersaoDoLead) {
    try {
      await navigator.clipboard.writeText(v.link);
      toast.sucesso('Link copiado.');
      void marcarOrcamentoEnviado(v.id, 'link');
    } catch {
      toast.erro('Não deu para copiar o link.');
    }
  }

  async function preReservar(v: VersaoDoLead) {
    setReservando(v.id);
    const r = await preReservarOrcamento(v.id);
    setReservando(null);
    if (r.ok) {
      toast.sucesso('Pré-reserva feita. Está na Agenda.');
      router.refresh();
    } else toast.erro(r.erro);
  }

  return (
    <div className="mt-2 flex flex-col gap-3" data-testid="orcamentos-do-lead">
      {grupos.map(({ numero, versoes }) => {
        const [v, ...anteriores] = versoes as [VersaoDoLead, ...VersaoDoLead[]];
        const podeReservar =
          !v.ehTeste &&
          (v.status === 'enviado' || v.status === 'visualizado') &&
          !v.validade?.expirada;
        return (
          <article key={numero} className="rounded-md border p-3" data-testid="orcamento-lead">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                Nº {numeroProposta(numero)}
                {v.versao > 1 && (
                  <span className="text-muted-foreground font-normal"> · versão {v.versao}</span>
                )}
              </span>
              <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-semibold">
                {rotuloStatus(v)}
              </span>
            </div>
            <p className="text-muted-foreground">{resumoDaFesta(v)}</p>
            {v.diferencas.length > 0 && (
              <ul className="text-info mt-1 text-xs" aria-label="O que mudou nesta versão">
                {v.diferencas.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            <Itens v={v} />
            {v.totalCentavos != null && (
              <p className="mt-2 flex justify-between font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatBRL(v.totalCentavos)}</span>
              </p>
            )}
            {v.validade && v.status !== 'aceito' && (
              <p
                className={`text-xs ${v.validade.expirada ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {v.validade.texto}
              </p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={v.link} target="_blank" rel="noopener noreferrer" className={ACAO}>
                <ExternalLink className="size-4" aria-hidden />
                Ver proposta
              </a>
              <a
                href={`/app/orcamentos/${v.id}/pdf`}
                className={ACAO}
                onClick={() => void marcarOrcamentoEnviado(v.id, 'pdf')}
              >
                <Download className="size-4" aria-hidden />
                PDF
              </a>
              {v.linkWhatsapp && (
                <a
                  href={v.linkWhatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ACAO}
                  onClick={() => void marcarOrcamentoEnviado(v.id, 'whatsapp')}
                >
                  <IconeWhatsApp className="size-4" />
                  WhatsApp
                </a>
              )}
              <button type="button" className={ACAO} onClick={() => void copiar(v)}>
                <Copy className="size-4" aria-hidden />
                Copiar link
              </button>
              <Link href={`/app/orcamentos/${v.id}/editar`} className={ACAO}>
                <FilePen className="size-4" aria-hidden />
                Nova versão
              </Link>
              {podeReservar && (
                <button
                  type="button"
                  className={ACAO}
                  disabled={reservando === v.id}
                  onClick={() => void preReservar(v)}
                >
                  {reservando === v.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <CalendarCheck className="size-4" aria-hidden />
                  )}
                  Pré-reservar
                </button>
              )}
            </div>

            {anteriores.length > 0 && (
              <details className="mt-3">
                <summary className="text-primary-texto cursor-pointer text-sm font-semibold">
                  Versões anteriores ({anteriores.length})
                </summary>
                <ol className="mt-2 flex flex-col gap-2">
                  {anteriores.map((a) => (
                    <li key={a.id} className="bg-muted/40 rounded-md p-2 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold">
                          Versão {a.versao} · {formatData(a.criadoEm)}
                        </span>
                        <span className="tabular-nums">
                          {a.totalCentavos != null ? formatBRL(a.totalCentavos) : ''}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{resumoDaFesta(a)}</p>
                      {a.diferencas.length > 0 && (
                        <ul className="mt-1">
                          {a.diferencas.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      )}
                      <a
                        href={`/app/orcamentos/${a.id}/pdf`}
                        className="text-primary-texto mt-1 inline-block font-semibold underline-offset-2 hover:underline"
                      >
                        PDF da versão {a.versao}
                      </a>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </article>
        );
      })}
    </div>
  );
}

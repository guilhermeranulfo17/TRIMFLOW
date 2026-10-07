'use client';

import { CircleCheck, Copy, FileSignature, Loader2 } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { TextoContrato } from '@/components/contrato/texto-contrato';
import { useToast } from '@/components/app/toast';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import Link from 'next/link';
import { PendenteLink } from '@/components/app/pendente-link';
import { Button } from '@/components/ui/button';
import { formatData } from '@/domain/dates';
import { enviarContrato, type ContratoEnviado } from '@/server/actions/contratos';

/*
 * Prévia e envio do contrato (Etapa 10, PR 1: o mínimo). O que o orçamento não trouxe aparece
 * destacado; o dono completa aqui e a prévia troca na hora. Enviar = o dono assina e o texto
 * fica travado. Depois: link, WhatsApp com mensagem pronta e copiar.
 */

const ACAO =
  'rounded-control inline-flex min-h-12 w-full items-center justify-center gap-2 border px-4 font-semibold transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

type Completavel = { nome: string; rotulo: string; ajuda?: string; valor: string };

export function NovoContrato(p: {
  orcamentoId: string;
  cliente: string;
  clienteTemEmail: boolean;
  modeloTitulo: string;
  texto: string;
  completaveis: Completavel[];
  rotulos: Record<string, string>;
  usoImagem: boolean;
  /** refazer: o contrato anterior é cancelado e o novo leva versão + 1 */
  substitui?: { id: string; codigo: string } | null;
}) {
  const toast = useToast();
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.completaveis.map((c) => [c.nome, c.valor])),
  );
  const [exigeCodigo, setExigeCodigo] = useState(p.clienteTemEmail);
  const [copiaEmail, setCopiaEmail] = useState(p.clienteTemEmail);
  const [validadeDias, setValidadeDias] = useState(14);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<ContratoEnviado | null>(null);
  const [pendente, iniciar] = useTransition();

  const texto = useMemo(
    () => p.texto.replace(/\[\[FALTA:([a-z_]+)\]\]/g, (m, n: string) => valores[n]?.trim() || m),
    [p.texto, valores],
  );
  const faltam = p.completaveis.filter((c) => !valores[c.nome]?.trim());

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const r = await enviarContrato({
        orcamentoId: p.orcamentoId,
        preencher: valores,
        exigeCodigo,
        validadeDias,
        enviarCopiaEmail: copiaEmail,
        substituiContratoId: p.substitui?.id ?? null,
      });
      if (r.ok && r.dados) {
        setEnviado(r.dados);
        toast.sucesso(r.mensagem);
      } else if (!r.ok) setErro(r.erro);
    });
  }

  async function copiar() {
    if (!enviado) return;
    try {
      await navigator.clipboard.writeText(enviado.link);
      toast.sucesso('Link copiado.');
    } catch {
      toast.erro('Não deu para copiar. Segure o link para copiar.');
    }
  }

  if (enviado) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4" data-testid="contrato-enviado">
        <div className="bg-card rounded-card border p-5 text-center">
          <CircleCheck className="text-primary-texto mx-auto size-10" aria-hidden />
          <h2 className="mt-2 text-xl font-extrabold">Contrato {enviado.codigo} pronto</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Você já assinou. Agora mande o link para {p.cliente} ler e assinar. O link vale até{' '}
            {formatData(enviado.expiraEm)}.
          </p>
          <p className="mt-3 truncate text-sm" title={enviado.link}>
            <a
              href={enviado.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-texto font-semibold underline-offset-2 hover:underline"
              data-testid="link-contrato"
            >
              {enviado.link.replace(/^https?:\/\//, '')}
            </a>
          </p>
        </div>
        {enviado.linkWhatsapp && (
          <a
            href={enviado.linkWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 font-bold"
          >
            <IconeWhatsApp />
            Mandar pelo WhatsApp
          </a>
        )}
        <button type="button" className={ACAO} onClick={() => void copiar()}>
          <Copy className="size-4" aria-hidden />
          Copiar link
        </button>
        <Link href={`/app/contratos/${enviado.id}`} className={ACAO}>
          Ver o contrato
          <PendenteLink />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <article
        className="bg-card rounded-card min-w-0 border p-4 sm:p-6"
        data-testid="previa-contrato"
      >
        <p className="text-muted-foreground mb-4 text-sm">Modelo: {p.modeloTitulo}</p>
        <TextoContrato texto={texto} rotulosFalta={p.rotulos} />
      </article>

      <aside className="bg-card rounded-card flex flex-col gap-4 border p-4 lg:sticky lg:top-6">
        <h2 className="font-bold">Enviar para {p.cliente}</h2>
        {p.substitui && (
          <p className="bg-info/10 text-info border-info/30 rounded-control border p-3 text-sm">
            Este contrato substitui o {p.substitui.codigo}, que será cancelado ao enviar.
          </p>
        )}
        {p.completaveis.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">Complete o que o orçamento não trouxe:</p>
            {p.completaveis.map((c) => (
              <label key={c.nome} className="text-sm font-semibold">
                {c.rotulo}
                <input
                  className="rounded-control border-input bg-background focus-visible:ring-ring/50 mt-1 block h-11 w-full border px-3 text-base font-normal focus-visible:ring-[3px] focus-visible:outline-none"
                  value={valores[c.nome] ?? ''}
                  onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.value }))}
                  aria-invalid={!valores[c.nome]?.trim() || undefined}
                  data-variavel={c.nome}
                />
                {c.ajuda && (
                  <span className="text-muted-foreground block font-normal">{c.ajuda}</span>
                )}
              </label>
            ))}
          </div>
        )}

        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="accent-primary mt-0.5 size-5"
            checked={exigeCodigo}
            disabled={!p.clienteTemEmail}
            onChange={(e) => setExigeCodigo(e.target.checked)}
          />
          <span>
            <span className="font-semibold">Exigir código por e-mail</span>
            <span className="text-muted-foreground block">
              {p.clienteTemEmail
                ? 'O cliente recebe um código de 6 números para confirmar a assinatura.'
                : 'O cliente não tem e-mail no cadastro: a assinatura segue sem o código.'}
            </span>
          </span>
        </label>

        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="accent-primary mt-0.5 size-5"
            checked={copiaEmail}
            disabled={!p.clienteTemEmail}
            onChange={(e) => setCopiaEmail(e.target.checked)}
            data-testid="copia-email"
          />
          <span>
            <span className="font-semibold">Mandar a cópia assinada por e-mail</span>
            <span className="text-muted-foreground block">
              {p.clienteTemEmail
                ? 'Depois da assinatura, o cliente recebe o PDF com o comprovante no e-mail.'
                : 'O cliente não tem e-mail no cadastro: ele baixa a cópia pelo próprio link.'}
            </span>
          </span>
        </label>

        <label className="text-sm font-semibold">
          Link vale por
          <select
            className="rounded-control border-input bg-background mt-1 block h-11 w-full border px-3 text-base font-normal"
            value={validadeDias}
            onChange={(e) => setValidadeDias(Number(e.target.value))}
          >
            {[3, 7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </select>
        </label>

        {faltam.length > 0 && (
          <p className="text-alerta text-sm font-semibold" role="status">
            Falta preencher: {faltam.map((f) => f.rotulo).join(', ')}.
          </p>
        )}
        {erro && (
          <p className="text-erro text-sm font-semibold" role="alert">
            {erro}
          </p>
        )}
        <Button
          type="button"
          onClick={enviar}
          disabled={pendente || faltam.length > 0}
          className="min-h-12 w-full"
          data-testid="enviar-contrato"
        >
          {pendente ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <FileSignature className="size-4" aria-hidden />
          )}
          Assinar e enviar
        </Button>
        <p className="text-muted-foreground text-xs">
          Ao enviar, você assina pelo buffet e o texto não muda mais. Para mudar depois, cancele e
          gere um contrato novo.
        </p>
      </aside>
    </div>
  );
}

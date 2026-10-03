'use client';

import { ExternalLink, Inbox } from 'lucide-react';
import Link from 'next/link';
import { BotaoCopiar } from '@/components/app/divulgacao/botao-copiar';
import type { TextoPronto } from '@/domain/divulgacao/textos';

/** Passo 5: o link no ar, com Copiar, Testar como cliente, QR e os textos prontos. */
export function PassoPronto({
  link,
  slug,
  textos,
  qr,
}: {
  link: string;
  slug: string;
  textos: TextoPronto[];
  qr: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 pb-8">
      <p className="text-muted-foreground">
        Pronto! Este é o seu link. Coloque na bio do Instagram e na resposta automática do WhatsApp.
      </p>
      <div className="bg-card rounded-card border p-4">
        <p className="text-primary-texto text-lg font-bold break-all" data-testid="link-pronto">
          {link}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <BotaoCopiar texto={link} rotulo="Copiar link" />
          <a
            href={`/b/${slug}`}
            target="_blank"
            rel="noopener"
            className="bg-primary text-primary-foreground rounded-control inline-flex min-h-11 items-center gap-2 px-4 text-sm font-semibold"
            data-testid="testar-como-cliente"
          >
            <ExternalLink className="size-4" aria-hidden /> Testar como cliente
          </a>
        </div>
      </div>
      <div className="bg-card rounded-card border p-4">
        <h2 className="mb-3 font-semibold">QR code</h2>
        {qr}
      </div>
      <div className="bg-card rounded-card flex flex-col gap-4 border p-4">
        {textos.map((t) => (
          <div key={t.chave} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{t.titulo}</p>
              <BotaoCopiar texto={t.texto} rotuloAcessivel={`Copiar: ${t.titulo}`} />
            </div>
            <p className="rounded-control bg-muted text-muted-foreground px-3 py-2 text-sm break-words whitespace-pre-line">
              {t.texto}
            </p>
          </div>
        ))}
      </div>
      <Link
        href="/app/leads"
        className="bg-primary text-primary-foreground rounded-control inline-flex min-h-11 items-center justify-center gap-2 px-4 font-semibold"
        data-testid="ir-para-caixa"
      >
        <Inbox className="size-4" aria-hidden /> Ir para minha caixa de leads
      </Link>
    </div>
  );
}

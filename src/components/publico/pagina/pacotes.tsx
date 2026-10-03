'use client';

import { CalendarDays, Clock, PartyPopper, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { formatBRL } from '@/domain/money';
import { resumoCardapio } from '@/domain/publico/cardapio';
import type { VitrinePublica } from '@/domain/publico/vitrine';
import { BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '../marca';
import { Carrossel } from './carrossel';

type Pacote = VitrinePublica['pacotes'][number] & { fotosUrl: string[] };

type Props = {
  pacotes: Pacote[];
  /** link do orçamento sem o pacote (null = orçamento indisponível) */
  linkOrcamento: string | null;
};

function duracao(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h} horas`;
}

function convidados(p: Pacote): string {
  return p.maxConvidados
    ? `${p.minConvidados} a ${p.maxConvidados} convidados`
    : `a partir de ${p.minConvidados} convidados`;
}

function comPacote(link: string, id: string): string {
  return `${link}${link.includes('?') ? '&' : '?'}pacote=${id}`;
}

/** Pacotes em cartões (grade no PC, coluna no celular) e "Ver detalhes" numa gaveta. */
export function PacotesPublicos({ pacotes, linkOrcamento }: Props) {
  const gaveta = useRef<HTMLDialogElement>(null);
  const [aberto, setAberto] = useState<Pacote | null>(null);
  const origem = useRef<HTMLElement | null>(null);

  const abrir = (p: Pacote, botao: HTMLElement) => {
    origem.current = botao;
    setAberto(p);
    gaveta.current?.showModal();
  };

  return (
    <>
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {pacotes.map((p) => (
          <li
            key={p.id}
            className="rounded-card flex flex-col overflow-hidden border bg-white shadow-sm"
            data-testid="pacote-publico"
          >
            <div className="bg-accent relative aspect-[4/3]">
              {p.fotosUrl.length > 0 ? (
                <Carrossel
                  fotos={p.fotosUrl}
                  nome={p.nome}
                  className="size-full"
                  sizes="(min-width: 1024px) 380px, (min-width: 768px) 50vw, 100vw"
                />
              ) : (
                <div
                  className="text-accent-foreground grid size-full place-items-center"
                  aria-hidden
                >
                  <PartyPopper className="size-12 opacity-60" />
                </div>
              )}
              {p.destaque && (
                <span className="bg-primary text-primary-foreground absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-bold shadow">
                  Mais pedido
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-5">
              <h3 className="font-titulo text-xl leading-tight font-bold">{p.nome}</h3>
              {p.subtitulo && <p className="text-muted-foreground text-sm">{p.subtitulo}</p>}
              {p.aPartirDeCentavos !== null && (
                <p className="text-primary-texto text-base font-bold">
                  a partir de {formatBRL(p.aPartirDeCentavos)}
                </p>
              )}
              <ul className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <li className="flex items-center gap-1">
                  <Users className="size-4" aria-hidden />
                  {convidados(p)}
                </li>
                <li className="flex items-center gap-1">
                  <Clock className="size-4" aria-hidden />
                  {duracao(p.duracaoInclusaMin)}
                </li>
              </ul>
              <div className="mt-auto flex gap-2 pt-3">
                <button
                  type="button"
                  className={`${BOTAO_SECUNDARIO} flex-1`}
                  onClick={(e) => abrir(p, e.currentTarget)}
                  aria-haspopup="dialog"
                >
                  Ver detalhes
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <dialog
        ref={gaveta}
        className="gaveta rounded-t-card text-foreground m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto bg-white p-0 shadow-xl md:mr-0 md:ml-auto md:h-dvh md:max-h-none md:w-[440px] md:rounded-none"
        aria-labelledby="titulo-gaveta"
        onClose={() => {
          setAberto(null);
          origem.current?.focus();
        }}
        onClick={(e) => {
          // clique no fundo (fora do conteúdo) fecha
          if (e.target === e.currentTarget) gaveta.current?.close();
        }}
        data-testid="gaveta-pacote"
      >
        {aberto && (
          <div className="flex min-h-full flex-col">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-white px-5 py-3">
              <h2 id="titulo-gaveta" className="font-titulo text-xl font-bold">
                {aberto.nome}
              </h2>
              <button
                type="button"
                onClick={() => gaveta.current?.close()}
                className="hover:bg-accent focus-visible:ring-ring/50 grid size-11 place-items-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none"
                aria-label="Fechar"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {aberto.fotosUrl.length > 0 && (
              <Carrossel
                fotos={aberto.fotosUrl}
                nome={aberto.nome}
                className="aspect-[4/3] w-full"
                prioridade
                sizes="(min-width: 768px) 440px, 100vw"
              />
            )}
            <div className="flex flex-1 flex-col gap-4 p-5 text-sm">
              {aberto.subtitulo && <p className="text-muted-foreground">{aberto.subtitulo}</p>}
              {aberto.aPartirDeCentavos !== null && (
                <p className="text-primary-texto text-lg font-bold">
                  a partir de {formatBRL(aberto.aPartirDeCentavos)}
                </p>
              )}
              <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                <li className="flex items-center gap-1">
                  <Users className="size-4" aria-hidden />
                  {convidados(aberto)}
                </li>
                <li className="flex items-center gap-1">
                  <Clock className="size-4" aria-hidden />
                  {duracao(aberto.duracaoInclusaMin)} de festa
                </li>
              </ul>
              {aberto.descricao && (
                <div>
                  <h3 className="font-bold">O que está incluso</h3>
                  <p className="mt-1 whitespace-pre-line">{aberto.descricao}</p>
                </div>
              )}
              {aberto.secoes.some((s) => s.itens.length > 0) && (
                <div>
                  <h3 className="font-bold">Cardápio</h3>
                  {resumoCardapio(aberto.secoes) && (
                    <p className="text-muted-foreground">{resumoCardapio(aberto.secoes)}</p>
                  )}
                  {aberto.secoes.map((s) =>
                    s.itens.length > 0 ? (
                      <div key={s.nome} className="mt-2">
                        <h4 className="font-semibold">{s.nome}</h4>
                        <p className="text-muted-foreground">{s.itens.join(', ')}</p>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </div>
            {linkOrcamento && (
              <div className="sticky bottom-0 border-t bg-white p-4">
                <Link
                  href={comPacote(linkOrcamento, aberto.id)}
                  className={`${BOTAO_PRINCIPAL} w-full`}
                >
                  <CalendarDays className="size-5" aria-hidden />
                  Orçar este pacote
                </Link>
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

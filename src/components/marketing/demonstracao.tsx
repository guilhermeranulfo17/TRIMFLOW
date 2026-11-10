'use client';

import { ArrowLeft, CalendarDays, ExternalLink, Package, Sparkles, Users } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
// Os MESMOS passos do link público do buffet (b/[slug]/orcamento): Pacote e Extras.
import PassoExtras from '@/app/b/[slug]/orcamento/passo-extras';
import PassoPacote from '@/app/b/[slug]/orcamento/passo-pacote';
import { Contador } from '@/components/orcamento/contador';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { BOTAO_PRINCIPAL, estiloDaMarca } from '@/components/publico/marca';
import {
  comConvidados,
  COR_BUFFET_EXEMPLO,
  pedidoDaDemonstracao,
  previaDaDemonstracao,
  type ExemploDemonstracao,
} from '@/domain/marketing/demonstracao';
import { formatBRL } from '@/domain/money';
import { pessoas } from '@/domain/publico/passos';
import type { Escolhas } from '@/domain/publico/tipos';
import { avisarProspeccao } from './prospeccao';

const PASSOS = [
  { numero: 1, curto: 'Pacote', titulo: 'Escolha o pacote' },
  { numero: 2, curto: 'Extras', titulo: 'Quer incluir algo a mais?' },
] as const;

/**
 * Demonstração e resultado da landing. O visitante monta um orçamento no "Buffet Exemplo" com os
 * passos reais do link público (mesmo cálculo, rodando no navegador com preços fictícios) e vê,
 * logo abaixo, como o pedido chega para o dono do buffet. Nada é enviado ao servidor.
 */
export function Demonstracao({ exemplo }: { exemplo: ExemploDemonstracao }) {
  const id = useId();
  const [escolhas, setEscolhas] = useState<Escolhas>(exemplo.inicial);
  const [passo, setPasso] = useState<1 | 2>(1);
  const [chegou, setChegou] = useState(false);
  // a pessoa mexeu em alguma coisa (convidados, pacote ou extra)
  const [mexeu, setMexeu] = useState(false);
  const cartao = useRef<HTMLDivElement>(null);
  const resultado = useRef<HTMLElement>(null);

  const alterar = useCallback((parcial: Partial<Escolhas>) => {
    setMexeu(true);
    setEscolhas((atual) => ({ ...atual, ...parcial }));
  }, []);

  /**
   * Chegou ao resultado (uma vez): pelo botão do último passo ou rolando até o pedido depois de
   * mexer na demonstração. É o "montou um orçamento" do rastreio (só sai se houver r no link).
   */
  const marcarChegada = useCallback(() => {
    setChegou((antes) => {
      if (!antes) avisarProspeccao('montou_orcamento');
      return true;
    });
  }, []);

  useEffect(() => {
    const alvo = resultado.current;
    if (!mexeu || chegou || !alvo || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) marcarChegada();
      },
      { threshold: 0.5 },
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [mexeu, chegou, marcarChegada]);
  const previa = useMemo(() => previaDaDemonstracao(exemplo, escolhas), [exemplo, escolhas]);
  const pedido = useMemo(
    () => pedidoDaDemonstracao(exemplo, escolhas, previa),
    [exemplo, escolhas, previa],
  );

  const total = previa.totalCentavos != null ? formatBRL(previa.totalCentavos) : null;
  const info = PASSOS[passo - 1]!;
  const props = {
    slug: 'buffet-exemplo',
    vitrine: exemplo.vitrine,
    escolhas,
    alterar,
    previa,
    carregando: false,
    buffet: { nome: exemplo.buffet, whatsappE164: null },
  };

  // ao trocar de passo, o cartão volta para o topo da tela (depois de desenhar o passo novo)
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    cartao.current?.scrollIntoView({ block: 'start' });
  }, [passo]);

  function verPedido() {
    marcarChegada();
    resultado.current?.scrollIntoView({ block: 'start' });
    resultado.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <section
        id="demonstracao"
        aria-labelledby={`${id}-titulo`}
        className="ld-gelo relative rounded-t-[2rem] px-5 pt-10 pb-14 md:rounded-t-[3rem] md:pt-24 md:pb-28"
      >
        <div className="mx-auto grid max-w-md gap-6 lg:max-w-5xl lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-center lg:gap-16">
          <div>
            <p className="text-primary-texto text-sm font-bold tracking-[0.14em] uppercase">
              Demonstração
            </p>
            <h2 id={`${id}-titulo`} className="ld-titulo mt-3 text-[2.6rem] md:text-6xl">
              Agora o cliente é{' '}
              <span className="ld-serif text-primary-texto text-[1.1em]">você</span>.
            </h2>
            <p className="text-muted-foreground mt-3 max-w-sm text-base md:text-lg">
              Mexa e veja o valor mudar na hora. Valores fictícios.
            </p>
          </div>

          {/* a página do buffet: claro neutro com a cor do buffet, como no link público */}
          <div
            ref={cartao}
            className="tema-claro scroll-mt-4 overflow-hidden rounded-[1.75rem] border border-black/10 bg-white shadow-[0_30px_80px_-40px_rgb(10_10_10/0.45)]"
            style={estiloDaMarca(COR_BUFFET_EXEMPLO)}
            data-tema="claro"
            data-testid="demonstracao"
          >
            <div className="border-b px-4 pt-3 pb-3">
              <div className="flex items-center gap-2">
                {passo === 2 && (
                  <button
                    type="button"
                    onClick={() => setPasso(1)}
                    className="hover:bg-accent -ml-2 grid size-11 place-items-center rounded-full"
                    aria-label="Voltar ao passo anterior"
                  >
                    <ArrowLeft className="size-5" aria-hidden />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground truncate text-xs font-semibold">
                    {exemplo.buffet}
                  </p>
                  <p className="text-sm font-bold" data-testid="demo-passo">
                    Passo {passo} de {PASSOS.length} · {info.curto}
                  </p>
                </div>
              </div>
              <div
                className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={PASSOS.length}
                aria-valuenow={passo}
                aria-label="Progresso do orçamento"
              >
                <div
                  className="bg-primary h-full rounded-full transition-[width] motion-reduce:transition-none"
                  style={{ width: `${(passo / PASSOS.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="px-4 pt-4 pb-5">
              <h3 className="text-xl font-bold tracking-tight">{info.titulo}</h3>
              <div className="mt-3">
                {passo === 1 ? (
                  <>
                    <div className="rounded-card mb-4 border px-4 py-1">
                      <Contador
                        id={`${id}-convidados`}
                        rotulo="Convidados"
                        valor={pessoas(escolhas)}
                        min={exemplo.convidados.min}
                        max={exemplo.convidados.max}
                        passo={exemplo.convidados.passo}
                        aoMudar={(n) => {
                          setMexeu(true);
                          setEscolhas((atual) => comConvidados(exemplo, atual, n));
                        }}
                      />
                    </div>
                    <PassoPacote {...props} />
                  </>
                ) : (
                  <PassoExtras {...props} />
                )}
              </div>
            </div>

            <div className="border-t bg-white px-4 pt-3 pb-4" data-testid="demo-resumo">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground min-w-0 truncate text-sm">
                  {pedido.convidados} convidados
                </span>
                <span className="shrink-0 text-lg font-extrabold" data-testid="demo-total">
                  {/* a chave refaz a animação a cada valor novo */}
                  <span key={total} className="ld-valor tabular-nums">
                    {total ? `Total ${total}` : 'Escolha um pacote'}
                  </span>
                </span>
              </div>
              <p className="sr-only" aria-live="polite" aria-atomic="true">
                {total
                  ? `Pacote ${pedido.pacote}, ${pedido.convidados} convidados: total ${total}.`
                  : ''}
              </p>
              <button
                type="button"
                onClick={passo === 1 ? () => setPasso(2) : verPedido}
                disabled={!total}
                className={`${BOTAO_PRINCIPAL} mt-3 w-full`}
              >
                {passo === 1 ? 'Continuar' : 'Ver como o buffet recebe'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section
        id="resultado"
        ref={resultado}
        tabIndex={-1}
        aria-labelledby={`${id}-resultado`}
        className="relative px-5 py-20 outline-none md:py-28"
        data-chegou={chegou}
      >
        <div className="mx-auto grid max-w-md gap-10 lg:max-w-5xl lg:grid-cols-[1fr_minmax(0,24rem)] lg:items-center lg:gap-16">
          <div>
            <h2 id={`${id}-resultado`} className="ld-titulo text-[2.6rem] md:text-6xl">
              É assim que o pedido{' '}
              <span className="ld-serif text-[1.1em] text-[var(--ld-limao)]">chega</span> pra você.
            </h2>
            <p className="mt-4 max-w-sm text-base text-white/70 md:text-lg">
              Organizado, com data, convidados, pacote e valor.
            </p>
          </div>

          {/* a chave refaz a animação de chegada quando a pessoa termina de montar */}
          <div
            key={chegou ? 'chegou' : 'previa'}
            className={`${chegou ? 'ld-chegar' : ''}rounded-[1.75rem] border border-white/10 bg-[#121512] p-3 shadow-[0_40px_100px_-40px_rgb(192_240_90/0.35)]`}
            data-testid="pedido"
          >
            <div className="flex items-center gap-2 px-2 pt-1 pb-3 text-sm">
              <span className="text-[var(--ld-verde)]">
                <IconeWhatsApp className="size-5" />
              </span>
              <span className="font-semibold">WhatsApp</span>
              <span className="ml-auto text-white/50">agora</span>
            </div>
            <div className="rounded-2xl rounded-tl-md bg-[#1c221c] p-4">
              <p className="text-sm font-bold text-[var(--ld-limao)]">Nova pré-reserva pelo link</p>
              <p className="mt-1 text-lg font-bold">
                {pedido.cliente} · {pedido.tipoEvento}
              </p>
              <dl className="mt-3 space-y-2 text-[0.95rem]">
                <Linha icone={<CalendarDays className="size-4" aria-hidden />} rotulo="Data">
                  {pedido.quando.charAt(0).toUpperCase() + pedido.quando.slice(1)}
                </Linha>
                <Linha icone={<Users className="size-4" aria-hidden />} rotulo="Convidados">
                  {pedido.convidados} convidados
                </Linha>
                <Linha icone={<Package className="size-4" aria-hidden />} rotulo="Pacote">
                  {pedido.pacote ? `Pacote ${pedido.pacote}` : 'A escolher'}
                </Linha>
                {pedido.extras.length > 0 && (
                  <Linha icone={<Sparkles className="size-4" aria-hidden />} rotulo="Extras">
                    {pedido.extras.join(', ')}
                  </Linha>
                )}
              </dl>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/10 pt-3">
                <span className="text-sm text-white/60">Valor</span>
                <span
                  className="ld-titulo text-3xl text-[var(--ld-limao)] tabular-nums"
                  data-testid="pedido-total"
                >
                  {pedido.totalCentavos != null ? formatBRL(pedido.totalCentavos) : 'A definir'}
                </span>
              </div>
            </div>
            {/* o botão do modelo de mensagem, só como figura (não é um link de verdade aqui) */}
            <div
              aria-hidden
              className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-[#1c221c] py-3 text-sm font-semibold text-[var(--ld-verde)]"
            >
              <ExternalLink className="size-4" />
              Abrir no Orkestra
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Linha({
  icone,
  rotulo,
  children,
}: {
  icone: React.ReactNode;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <dt className="mt-0.5 shrink-0 text-[var(--ld-verde)]">
        {icone}
        <span className="sr-only">{rotulo}</span>
      </dt>
      <dd className="min-w-0 text-white/90">{children}</dd>
    </div>
  );
}

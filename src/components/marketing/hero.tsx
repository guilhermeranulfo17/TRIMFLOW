import {
  BellRing,
  CalendarCheck,
  CalendarDays,
  FileSignature,
  FileText,
  Link2,
  Repeat,
  Wallet,
} from 'lucide-react';
import Image from 'next/image';
import { BotaoTeste } from './ctas';

const TITULO = 'O cliente monta o orçamento';
const TITULO_DESTAQUE = 'sozinho.';

/** Cada palavra sobe de dentro da própria linha (CSS); o texto do h1 continua o mesmo. */
function Palavras({ texto, de, className }: { texto: string; de: number; className?: string }) {
  return texto.split(' ').map((p, i) => (
    <span key={`${p}-${i}`}>
      <span className="ld-palavra">
        <span className={className} style={{ ['--i' as string]: de + i }}>
          {p}
        </span>
      </span>{' '}
    </span>
  ));
}

/**
 * Hero: a foto da equipe do buffet ocupa a tela (LCP) e o texto, curto e em caixa alta, fica na
 * sombra da esquerda. No notebook a foto vai encostada à direita para as pessoas aparecerem
 * inteiras; no celular ela fica em cima e o texto embaixo, no escuro.
 */
export function Hero({ demoSlug, diasTeste }: { demoSlug: string | null; diasTeste: number }) {
  const n = TITULO.split(' ').length;
  return (
    <section
      className="relative isolate overflow-hidden lg:flex lg:min-h-[min(100svh,58rem)] lg:items-center"
      aria-labelledby="titulo-hero"
    >
      <div className="relative h-[min(100vw,30rem)] overflow-hidden sm:h-[34rem] lg:absolute lg:inset-0 lg:h-auto">
        <Image
          src="/landing/hero-equipe.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="ld-foto object-cover object-[84%_25%] sm:object-[78%_25%] lg:object-[70%_30%]"
        />
        {/* sombra: em cima (cabeçalho) e embaixo no celular; à esquerda e embaixo no notebook */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent lg:hidden"
        />
        <div
          aria-hidden
          className="from-background via-background/40 absolute inset-0 bg-gradient-to-t via-35% to-transparent to-60% lg:hidden"
        />
        <div
          aria-hidden
          className="from-background via-background/75 absolute inset-0 hidden bg-gradient-to-r via-30% to-transparent to-60% lg:block"
        />
        <div
          aria-hidden
          className="from-background absolute inset-x-0 bottom-0 hidden h-40 bg-gradient-to-t to-transparent lg:block"
        />
      </div>

      <div className="relative mx-auto -mt-20 w-full max-w-7xl px-4 pb-12 sm:-mt-32 md:px-6 lg:mt-0 lg:px-12 lg:pt-28 lg:pb-24 2xl:max-w-none 2xl:pl-[calc(50vw-30.75rem)]">
        <div className="max-w-xl min-w-0 xl:max-w-2xl">
          <p
            className="ld-subir text-primary-texto mb-5 text-xs font-bold tracking-[0.22em] uppercase"
            style={{ ['--atraso' as string]: '0ms' }}
          >
            Para buffets de festas
          </p>
          <h1
            id="titulo-hero"
            className="text-[2.6rem] leading-[0.98] font-extrabold tracking-[-0.03em] text-balance uppercase sm:text-6xl lg:text-[3.6rem] xl:text-7xl"
          >
            <Palavras texto={TITULO} de={0} />
            <Palavras texto={TITULO_DESTAQUE} de={n} className="ld-texto-limao" />
          </h1>
          <p className="mt-5 text-base font-semibold tracking-[0.06em] text-white/80 uppercase sm:text-lg">
            Você só entra quando ele quer reservar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <BotaoTeste className="shadow-[0_0_40px_-6px_rgb(178_247_89/0.55)]">
              Testar {diasTeste} dias grátis
            </BotaoTeste>
            {demoSlug && (
              // POST: entrar na demo abre uma sessão (um prefetch de link nunca pode fazer isso)
              <form method="post" action="/demo/entrar">
                <button
                  type="submit"
                  className="focus-visible:ring-ring/60 inline-flex min-h-13 w-full items-center justify-center rounded-full border border-white/20 bg-black/30 px-7 text-base font-semibold backdrop-blur transition-colors hover:border-white/45 hover:bg-white/10 focus-visible:ring-[3px] focus-visible:outline-none sm:w-auto"
                  data-testid="ver-demo"
                >
                  Ver o painel de demonstração
                </button>
              </form>
            )}
          </div>
          <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/70">
            <span className="inline-flex items-center gap-2">
              <span className="bg-primary ld-pulso size-2 rounded-full" aria-hidden />
              {diasTeste} dias grátis, sem cartão
            </span>
            <span>Cancele quando quiser</span>
            {demoSlug && (
              <a
                href={`/b/${demoSlug}`}
                className="text-foreground font-semibold underline underline-offset-4 hover:decoration-[var(--primary)]"
                data-testid="ver-exemplo"
              >
                Ver o link de um buffet de exemplo
              </a>
            )}
          </p>
        </div>
      </div>
      <div id="marcador-fim-hero" aria-hidden className="absolute bottom-0 h-px w-full" />
    </section>
  );
}

const RECURSOS = [
  { icone: Link2, texto: 'Link de orçamento' },
  { icone: CalendarDays, texto: 'Agenda sem conflito' },
  { icone: CalendarCheck, texto: 'Pré-reserva' },
  { icone: FileText, texto: 'Proposta em PDF' },
  { icone: FileSignature, texto: 'Contrato digital' },
  { icone: Repeat, texto: 'Follow-up automático' },
  { icone: BellRing, texto: 'Avisos no celular' },
  { icone: Wallet, texto: 'Preço calculado na hora' },
];

/** Faixa limão inclinada correndo com os recursos (pausa ao passar o mouse). */
export function FaixaRecursos() {
  const itens = [...RECURSOS, ...RECURSOS];
  return (
    <div className="ld-faixa-pai relative z-10 -my-2 overflow-hidden py-10" aria-label="Recursos">
      <div className="bg-primary text-primary-foreground -mx-4 -rotate-2 overflow-hidden py-4 shadow-[0_20px_60px_-20px_rgb(178_247_89/0.5)]">
        <ul className="ld-faixa flex w-max gap-10 pr-10">
          {itens.map((r, i) => (
            <li
              key={i}
              aria-hidden={i >= RECURSOS.length || undefined}
              className="flex items-center gap-3 text-lg font-extrabold tracking-tight whitespace-nowrap uppercase"
            >
              <r.icone className="size-5" aria-hidden />
              {r.texto}
              <span aria-hidden className="ml-7 inline-block size-2 rotate-45 bg-black" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

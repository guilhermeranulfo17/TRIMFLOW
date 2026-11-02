import {
  CalendarCheck,
  ChevronRight,
  FileSignature,
  Inbox,
  ListChecks,
  Link2,
  Wallet,
} from 'lucide-react';
import Image from 'next/image';
import { BotaoTeste } from './ctas';

const TITULO = 'Seu cliente monta o orçamento.';
const TITULO_DESTAQUE = 'Você acompanha até a festa fechada.';

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
 * Hero: a foto da equipe do buffet ocupa a tela (LCP) e o texto fica na sombra da esquerda. No
 * notebook a foto vai encostada à direita para as pessoas aparecerem inteiras; no celular ela
 * fica em cima e o texto embaixo, no escuro. O segundo botão leva à demonstração da página.
 */
export function Hero({ demoSlug, diasTeste }: { demoSlug: string | null; diasTeste: number }) {
  const n = TITULO.split(' ').length;
  return (
    <section
      className="relative isolate overflow-hidden lg:flex lg:min-h-[min(100svh,58rem)] lg:items-center"
      aria-labelledby="titulo-hero"
    >
      <div className="relative h-[min(92vw,28rem)] overflow-hidden sm:h-[32rem] lg:absolute lg:inset-0 lg:h-auto">
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
          className="from-background via-background/80 absolute inset-0 hidden bg-gradient-to-r via-35% to-transparent to-65% lg:block"
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
            Para buffets e espaços de festas
          </p>
          <h1
            id="titulo-hero"
            className="text-[2.05rem] leading-[1.02] font-extrabold tracking-[-0.03em] text-balance uppercase sm:text-5xl lg:text-[3.05rem] xl:text-[3.6rem]"
          >
            <Palavras texto={TITULO} de={0} />
            <Palavras texto={TITULO_DESTAQUE} de={n} className="ld-texto-limao" />
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-white/85">
            Ele escolhe a data, os convidados e o pacote. Você recebe o contato e acompanha
            proposta, pré-reserva, contrato e recebimentos em um só lugar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <BotaoTeste className="shadow-[0_0_40px_-6px_rgb(178_247_89/0.55)]">
              Testar {diasTeste} dias grátis
            </BotaoTeste>
            <a
              href="#demonstracao"
              className="focus-visible:ring-ring/60 inline-flex min-h-13 items-center justify-center rounded-full border border-white/25 bg-black/30 px-7 text-base font-semibold backdrop-blur transition-colors hover:border-white/45 hover:bg-white/10 focus-visible:ring-[3px] focus-visible:outline-none"
              data-testid="experimentar-orcamento"
            >
              Experimentar o orçamento
            </a>
          </div>
          <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/75">
            <li className="inline-flex items-center gap-2">
              <span className="bg-primary ld-pulso size-2 rounded-full" aria-hidden />
              {diasTeste} dias grátis, sem cartão
            </li>
            <li>Cancele quando quiser</li>
          </ul>
          {demoSlug && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <a
                href={`/b/${demoSlug}`}
                className="text-foreground font-semibold underline underline-offset-4 hover:decoration-[var(--primary)]"
                data-testid="ver-exemplo"
              >
                Ver o link de um buffet de exemplo
              </a>
              {/* POST: entrar na demo abre uma sessão (um prefetch de link nunca pode fazer isso) */}
              <form method="post" action="/demo/entrar">
                <button
                  type="submit"
                  className="text-foreground focus-visible:ring-ring/60 min-h-11 rounded-md font-semibold underline underline-offset-4 hover:decoration-[var(--primary)] focus-visible:ring-[3px] focus-visible:outline-none"
                  data-testid="ver-demo"
                >
                  Ver o painel de demonstração
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
      <div id="marcador-fim-hero" aria-hidden className="absolute bottom-0 h-px w-full" />
    </section>
  );
}

const JORNADA = [
  { icone: Link2, texto: 'O cliente monta o orçamento' },
  { icone: Inbox, texto: 'Você recebe a oportunidade' },
  { icone: ListChecks, texto: 'Acompanha o atendimento' },
  { icone: CalendarCheck, texto: 'Organiza a reserva' },
  { icone: FileSignature, texto: 'Formaliza o contrato' },
  { icone: Wallet, texto: 'Controla os recebimentos' },
];

/** Faixa limão com a sequência do produto, do link ao dinheiro recebido (estática). */
export function Jornada() {
  return (
    <div className="relative z-10 px-3 py-6 lg:py-10">
      <div className="bg-primary text-primary-foreground mx-auto max-w-7xl rounded-[28px] px-4 py-5 shadow-[0_20px_60px_-20px_rgb(178_247_89/0.5)] sm:px-6 lg:-rotate-1 lg:rounded-none lg:px-8">
        <ol
          aria-label="Do orçamento aos recebimentos"
          className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-2"
        >
          {JORNADA.map((j, i) => (
            <li key={j.texto} className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-black/10">
                <j.icone className="size-[1.1rem]" aria-hidden />
              </span>
              <span className="min-w-0 text-sm leading-tight font-extrabold tracking-tight">
                <span className="sr-only">{i + 1}. </span>
                {j.texto}
              </span>
              {i < JORNADA.length - 1 && (
                <ChevronRight
                  className="ml-auto hidden size-4 shrink-0 opacity-50 lg:block"
                  aria-hidden
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

import {
  BellRing,
  CalendarCheck,
  CalendarDays,
  Check,
  FileSignature,
  FileText,
  Link2,
  MessageCircle,
  Repeat,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { Logotipo } from '@/components/marca/logotipo';
import { formatBRL } from '@/domain/money';
import { BotaoTeste } from './ctas';
import { ContadorValor } from './contador';

const TITULO_1 = 'O cliente monta o orçamento';
const TITULO_DESTAQUE = 'sozinho.';
const TITULO_2 = 'Você só entra quando ele quer reservar.';

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
 * Hero: grade e brilho limão no fundo, o título entrando palavra por palavra e o celular do
 * cliente em 3D, com os avisos do buffet chegando em volta (dados de exemplo, sem imagem
 * externa: o LCP é o título).
 */
export function Hero({ demoSlug, diasTeste }: { demoSlug: string | null; diasTeste: number }) {
  const n1 = TITULO_1.split(' ').length;
  return (
    <section
      className="relative overflow-hidden pt-32 pb-10 md:pt-40 md:pb-16"
      aria-labelledby="titulo-hero"
    >
      <div aria-hidden className="ld-grade pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="ld-brilho pointer-events-none absolute -top-40 -left-40 size-[42rem] rounded-full"
      />
      <div
        aria-hidden
        className="ld-brilho pointer-events-none absolute top-1/3 -right-60 size-[36rem] rounded-full opacity-60"
        style={{ animationDelay: '-7s' }}
      />
      <Logotipo
        titulo=""
        className="pointer-events-none absolute top-24 left-1/2 hidden w-[118rem] max-w-none -translate-x-1/2 text-transparent opacity-100 lg:block [&_path]:stroke-white/[0.05] [&_path]:[stroke-width:0.6]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 md:px-6 lg:grid-cols-[1.12fr_1fr] lg:gap-4">
        <div className="max-w-2xl min-w-0">
          <p
            className="ld-vidro ld-subir mb-6 inline-flex items-center gap-2.5 rounded-full py-1.5 pr-4 pl-2 text-sm font-semibold"
            style={{ ['--atraso' as string]: '0ms' }}
          >
            <span className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold">
              <Sparkles className="size-3.5" aria-hidden />
              Novo
            </span>
            Para buffets de festas
          </p>
          <h1
            id="titulo-hero"
            className="text-[2.5rem] leading-[1.04] font-extrabold tracking-[-0.035em] text-balance sm:text-6xl lg:text-[3.55rem]"
          >
            <Palavras texto={TITULO_1} de={0} />
            <Palavras texto={TITULO_DESTAQUE} de={n1} className="ld-texto-limao" />
            <Palavras
              texto={TITULO_2}
              de={n1 + 1}
              className="text-muted-foreground font-bold tracking-[-0.03em]"
            />
          </h1>
          <p
            className="text-muted-foreground mt-7 max-w-lg text-lg leading-relaxed text-pretty"
            data-entrada
          >
            O Orkestra dá ao seu buffet um link de orçamento que responde na hora, guarda cada
            contato e já mostra as datas livres. Menos mensagem repetida no WhatsApp, mais festa
            marcada.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <BotaoTeste className="shadow-[0_0_40px_-6px_rgb(178_247_89/0.55)]">
              Testar {diasTeste} dias grátis
            </BotaoTeste>
            {demoSlug && (
              // POST: entrar na demo abre uma sessão (um prefetch de link nunca pode fazer isso)
              <form method="post" action="/demo/entrar">
                <button
                  type="submit"
                  className="focus-visible:ring-ring/60 inline-flex min-h-13 w-full items-center justify-center rounded-full border border-white/15 px-7 text-base font-semibold transition-colors hover:border-white/40 hover:bg-white/5 focus-visible:ring-[3px] focus-visible:outline-none sm:w-auto"
                  data-testid="ver-demo"
                >
                  Ver o painel de demonstração
                </button>
              </form>
            )}
          </div>
          <p className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
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
        <Composicao />
      </div>
      <div id="marcador-fim-hero" aria-hidden className="h-px" />
    </section>
  );
}

/** Elipse da órbita (mesmo traçado no SVG e no offset-path dos pontos), num quadro de 520x560. */
const ORBITA = 'M 30 300 A 230 140 -18 1 1 490 260 A 230 140 -18 1 1 30 300 Z';
const ORBITA_2 = 'M 60 420 A 210 90 12 1 1 470 360 A 210 90 12 1 1 60 420 Z';

/** O celular do cliente com o orçamento pronto e, em volta, o que o buffet recebe. */
function Composicao() {
  return (
    // o quadro tem 520x560 fixos (as órbitas usam px); no celular ele só diminui (scale)
    <div className="relative mx-auto h-[380px] w-full min-w-0 sm:h-[510px] lg:h-[560px]">
      <figure className="absolute top-0 left-1/2 -ml-[260px] h-[560px] w-[520px] origin-top scale-[0.66] sm:scale-90 lg:scale-100">
        <figcaption className="sr-only">
          Exemplo: o cliente vê o orçamento de R$ 4.900 no celular e o buffet recebe o lead pronto
          para reservar.
        </figcaption>
        <div aria-hidden className="absolute inset-0">
          {/* órbitas */}
          <svg viewBox="0 0 520 560" className="absolute inset-0 size-full overflow-visible">
            <path
              d={ORBITA}
              fill="none"
              stroke="rgb(178 247 89 / 0.35)"
              strokeWidth="1.2"
              strokeDasharray="2 9"
              className="ld-tracejado"
            />
            <path d={ORBITA_2} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="1" />
          </svg>
          {[
            { caminho: ORBITA, duracao: '11s', atraso: '0s', tamanho: 'size-3' },
            { caminho: ORBITA, duracao: '11s', atraso: '-5.5s', tamanho: 'size-2' },
            { caminho: ORBITA_2, duracao: '15s', atraso: '-3s', tamanho: 'size-2.5' },
          ].map((p, i) => (
            <span
              key={i}
              className={`ld-orbita bg-primary absolute top-0 left-0 ${p.tamanho} rounded-full shadow-[0_0_18px_4px_rgb(178_247_89/0.6)]`}
              style={{
                offsetPath: `path('${p.caminho}')`,
                ['--duracao' as string]: p.duracao,
                ['--atraso' as string]: p.atraso,
              }}
            />
          ))}

          {/* celular */}
          <div className="absolute top-6 left-[150px]">
            <div className="ld-celular">
              <div className="relative w-[270px] rounded-[2.9rem] border border-white/15 bg-[#111] p-2.5 shadow-[0_40px_120px_-20px_rgb(0_0_0/0.9),0_0_80px_-30px_rgb(178_247_89/0.45)]">
                <div className="relative overflow-hidden rounded-[2.3rem] bg-[#0b0b0b]">
                  <div className="flex items-center justify-between px-6 pt-3 text-[11px] font-semibold text-white/80">
                    <span>09:41</span>
                    <span className="h-5 w-20 rounded-full bg-black" />
                    <span>5G</span>
                  </div>
                  <div className="px-5 pt-5 pb-6 text-white">
                    <p className="text-xs text-white/55">Buffet Alegria</p>
                    <p className="mt-0.5 text-lg font-bold">Seu orçamento</p>
                    <div className="mt-4 space-y-2.5 text-[13px]">
                      <Linha rotulo="Festa" valor="Infantil" />
                      <Linha rotulo="Data" valor="Sáb, 14/11 · Tarde" />
                      <Linha rotulo="Convidados" valor="60 pessoas" />
                      <Linha rotulo="Pacote" valor="Super" />
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
                      <p className="text-[11px] text-white/55">Total</p>
                      <p className="text-[1.65rem] font-extrabold tracking-tight tabular-nums">
                        <ContadorValor centavos={490000} />
                      </p>
                      <p className="text-[11px] text-white/55">
                        Sinal de {formatBRL(147000)} para reservar
                      </p>
                      <svg viewBox="0 0 200 40" className="mt-2 h-8 w-full">
                        <path
                          d="M0 34 C 25 30, 35 18, 60 22 S 100 34, 120 20 S 165 4, 200 8"
                          fill="none"
                          stroke="#B2F759"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <span className="bg-primary text-primary-foreground mt-4 flex min-h-11 items-center justify-center gap-1.5 rounded-full text-[13px] font-bold">
                      <CalendarCheck className="size-4" />
                      Pedir pré-reserva
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* o que chega para o buffet */}
          <div
            className="ld-chegar absolute top-[150px] -left-6"
            style={{ ['--atraso' as string]: '900ms', ['--de-x' as string]: '-40px' }}
          >
            <div className="ld-flutuar ld-flutuante w-56 rounded-2xl p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-xl">
                  <BellRing className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold">Novo orçamento</p>
                  <p className="truncate text-xs text-white/60">Ana · aniversário de 6 anos</p>
                </div>
              </div>
            </div>
          </div>

          <div
            className="ld-chegar absolute -right-8 bottom-12"
            style={{ ['--atraso' as string]: '1400ms', ['--de-y' as string]: '40px' }}
          >
            <div
              className="ld-flutuar ld-flutuante w-64 rounded-3xl p-4"
              style={{ ['--atraso' as string]: '-2s' }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">Ana</p>
                <span className="bg-alerta/15 text-alerta rounded-full px-2 py-0.5 text-xs font-semibold">
                  Quer reservar
                </span>
              </div>
              <p className="mt-1 text-xs text-white/60">60 pessoas · Sáb, 14/11</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-lg font-extrabold tabular-nums">{formatBRL(490000)}</span>
                <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold">
                  <MessageCircle className="size-3.5" />
                  WhatsApp
                </span>
              </div>
            </div>
          </div>

          <div
            className="ld-chegar absolute top-2 -right-6"
            style={{ ['--atraso' as string]: '1900ms', ['--de-y' as string]: '-30px' }}
          >
            <div
              className="ld-flutuar ld-flutuante flex items-center gap-2 rounded-full py-2 pr-4 pl-2 text-sm font-semibold"
              style={{ ['--atraso' as string]: '-4s' }}
            >
              <span className="grid size-7 place-items-center rounded-full bg-white text-black">
                <Check className="size-4" />
              </span>
              Data livre na agenda
            </div>
          </div>

          <p className="absolute bottom-2 left-6 text-xs text-white/45">Dados de exemplo</p>
        </div>
      </figure>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] pb-2.5">
      <span className="text-white/55">{rotulo}</span>
      <span className="font-semibold">{valor}</span>
    </div>
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

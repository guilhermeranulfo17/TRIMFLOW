import { CalendarCheck, Check, MessageCircle, Sparkles } from 'lucide-react';
import { formatBRL } from '@/domain/money';
import { BotaoTeste } from './ctas';

/**
 * Hero (seção escura): a promessa, os dois botões e a composição do produto feita com peças da
 * vitrine e do painel (dados de exemplo, sem imagem externa: o LCP é o título).
 */
export function Hero({ demoSlug, diasTeste }: { demoSlug: string | null; diasTeste: number }) {
  return (
    <section
      className="dark bg-background text-foreground relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24"
      style={{
        backgroundImage:
          'radial-gradient(55% 45% at 15% 10%, rgb(62 228 46 / 0.16), transparent 70%), radial-gradient(45% 40% at 95% 85%, rgb(62 228 46 / 0.09), transparent 70%)',
      }}
      aria-labelledby="titulo-hero"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 md:px-6 lg:grid-cols-[1.05fr_1fr]">
        <div className="max-w-xl">
          <p className="text-primary-texto mb-4 inline-flex items-center gap-2 text-sm font-bold">
            <Sparkles className="size-4" aria-hidden />
            Para buffets de festas
          </p>
          <h1
            id="titulo-hero"
            className="text-4xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]"
          >
            O cliente monta o orçamento sozinho. Você só entra quando ele quer reservar.
          </h1>
          <p className="text-muted-foreground mt-6 text-lg leading-relaxed text-pretty">
            O Orkestra dá ao seu buffet um link de orçamento que responde na hora, guarda cada
            contato e já mostra as datas livres. Menos mensagem repetida no WhatsApp, mais festa
            marcada.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <BotaoTeste>Testar {diasTeste} dias grátis</BotaoTeste>
            {demoSlug && (
              <a
                href={`/b/${demoSlug}`}
                className="focus-visible:ring-ring/60 inline-flex min-h-13 items-center justify-center rounded-full border px-7 text-base font-semibold transition-colors hover:bg-white/5 focus-visible:ring-[3px] focus-visible:outline-none"
                data-testid="ver-exemplo"
              >
                Ver um buffet de exemplo
              </a>
            )}
          </div>
          <p className="text-muted-foreground mt-5 text-sm">
            {diasTeste} dias grátis, sem cartão. Cancele quando quiser.
          </p>
        </div>
        <Composicao />
      </div>
      <div id="marcador-fim-hero" aria-hidden className="h-px" />
    </section>
  );
}

/** O celular do cliente com o orçamento pronto e o cartão do lead no painel do buffet. */
function Composicao() {
  return (
    <figure className="relative mx-auto w-full max-w-md lg:max-w-none">
      <figcaption className="sr-only">
        Exemplo: o cliente vê o orçamento de R$ 4.900 no celular e o buffet recebe o lead pronto
        para reservar.
      </figcaption>
      <div aria-hidden className="relative h-[27rem] sm:h-[29rem]">
        {/* celular do cliente: visual da vitrine (claro neutro) */}
        <div className="tema-claro bg-background text-foreground absolute top-0 left-0 w-[15.5rem] overflow-hidden rounded-[2.2rem] border-[6px] border-[#2a2a2a] shadow-2xl sm:left-4 sm:w-64">
          <div className="bg-primary text-primary-foreground px-4 pt-5 pb-4">
            <p className="text-xs opacity-80">Buffet Alegria</p>
            <p className="mt-1 text-sm font-bold">Seu orçamento</p>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <Linha rotulo="Festa" valor="Aniversário infantil" />
            <Linha rotulo="Data" valor="Sáb, 14/11 · Tarde" />
            <Linha rotulo="Convidados" valor="60 pessoas" />
            <Linha rotulo="Pacote" valor="Super" />
            <div className="bg-card rounded-card border p-3">
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="text-2xl font-extrabold tabular-nums">{formatBRL(490000)}</p>
              <p className="text-muted-foreground text-xs">
                Sinal de {formatBRL(147000)} para reservar
              </p>
            </div>
            <span className="bg-primary text-primary-foreground flex min-h-10 items-center justify-center gap-1.5 rounded-full text-xs font-bold">
              <CalendarCheck className="size-4" />
              Pedir pré-reserva
            </span>
          </div>
        </div>

        {/* cartão do lead no painel (escuro) */}
        <div className="bg-card text-card-foreground rounded-card absolute right-0 bottom-6 w-[16.5rem] border p-4 shadow-2xl sm:w-72">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold">Ana</p>
            <span className="bg-alerta/15 text-alerta rounded-full px-2 py-0.5 text-xs font-semibold">
              Quer reservar
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">Aniversário de 6 anos · 60 pessoas</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-lg font-extrabold tabular-nums">{formatBRL(490000)}</span>
            <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold">
              <MessageCircle className="size-3.5" />
              WhatsApp
            </span>
          </div>
          <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
            <Check className="text-primary-texto size-3.5" />
            Data segura por 48 h
          </p>
        </div>
        <p className="text-muted-foreground absolute bottom-0 left-0 text-xs sm:left-4">
          Dados de exemplo
        </p>
      </div>
    </figure>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-semibold">{valor}</span>
    </div>
  );
}

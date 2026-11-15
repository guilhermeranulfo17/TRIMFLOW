import {
  ArrowDown,
  BarChart3,
  BellRing,
  CalendarCheck,
  Check,
  ChevronDown,
  FileSignature,
  FileText,
  KanbanSquare,
  Link2,
  MessageCircleQuestion,
  NotebookPen,
  Store,
  Timer,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/app/logo';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import type { Duvida } from '@/domain/marketing';
import { cn } from '@/lib/utils';
import { BotaoTeste } from './ctas';
import { LinkEntrar } from './entrar';
import { PainelDeExemplo } from './maquetes';

/*
 * Landing completa (§95), toda do servidor: cabeçalho fixo, topo, para quem é, a rotina sem e com
 * o Orkestra, demonstração (ilha do cliente em demonstracao.tsx), como funciona, recursos, painel
 * por dentro, preço, dúvidas, chamada final e rodapé. Feita para o celular, sem imagem, sem
 * depoimento e sem número inventado.
 */

const NAV = [
  ['#como-funciona', 'Como funciona'],
  ['#recursos', 'Recursos'],
  ['#preco', 'Preço'],
  ['#duvidas', 'Dúvidas'],
] as const;

/** Botão limão compacto do cabeçalho: vai ao cadastro e conta como "Testar grátis". */
function TestarGratisCompacto() {
  return (
    <Link
      href="/cadastro"
      data-cta-teste
      className="inline-flex min-h-11 items-center rounded-full bg-[var(--ld-limao)] px-4 text-sm font-bold text-[#0a0a0a] transition-colors hover:bg-[#cdf57a] focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:outline-none"
      data-testid="cabecalho-testar"
    >
      Testar grátis
    </Link>
  );
}

/** Cabeçalho fixo: logo, seções (no computador), Entrar e Testar grátis. */
export function Cabecalho() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0a0a]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
        <Link href="/" aria-label="Orkestra, início" className="inline-flex min-h-11 items-center">
          <Logo />
        </Link>
        <nav aria-label="Seções" className="hidden lg:block">
          <ul className="flex gap-1">
            {NAV.map(([href, rotulo]) => (
              <li key={href}>
                <a
                  href={href}
                  className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-white/75 transition-colors hover:text-white"
                >
                  {rotulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <LinkEntrar />
          <TestarGratisCompacto />
        </div>
      </div>
    </header>
  );
}

/** 1. Topo: a foto, para quem é, a frase e os dois caminhos. */
export function Topo({ diasTeste }: { diasTeste: number }) {
  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="titulo-topo">
      {/* No celular a foto fica em cima (recorte na pessoa); no computador vira o fundo do
          topo, escurecido à esquerda para o texto. Gerada em 640, 1024 e 1672 px (sem otimizador). */}
      <div className="relative h-[34svh] min-h-56 md:absolute md:inset-0 md:h-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/topo-1024.webp"
          srcSet="/landing/topo-640.webp 640w, /landing/topo-1024.webp 1024w, /landing/topo-1672.webp 1672w"
          sizes="(max-width: 767px) 200vw, 100vw"
          width={1672}
          height={941}
          alt="Mulher de avental do Orkestra sorrindo enquanto confere um pedido no celular, no salão de um buffet"
          fetchPriority="high"
          decoding="async"
          className="size-full object-cover object-[72%_30%] md:object-[70%_center]"
          data-testid="foto-topo"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/25 to-transparent md:bg-gradient-to-r md:from-[#0a0a0a] md:via-[#0a0a0a]/85 md:to-[#0a0a0a]/5"
        />
      </div>
      <div className="relative mx-auto max-w-6xl px-5 pb-16 md:px-8 md:py-24 lg:py-32">
        <div className="-mt-12 md:mt-0 md:max-w-xl lg:max-w-2xl">
          <p className="ld-subir inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#0a0a0a]/60 px-3 py-1 text-sm font-semibold text-white/85 backdrop-blur">
            <Store className="size-4 text-[var(--ld-limao)]" aria-hidden />
            Para buffets de festa
          </p>
          <h1 id="titulo-topo" className="ld-titulo mt-4 text-[clamp(2.9rem,11vw,5.5rem)] md:mt-6">
            Seu cliente monta o orçamento{' '}
            <span className="ld-serif text-[1.1em] text-[var(--ld-limao)]">sozinho</span>.
          </h1>
          <p className="ld-subir mt-4 max-w-lg text-lg text-white/80 [--i:1] md:mt-6 md:text-xl">
            No link do seu buffet, com o seu preço. E o pedido chega pronto no seu WhatsApp, com
            data, convidados e valor.
          </p>
          <div className="ld-subir mt-6 flex max-w-md flex-col gap-3 [--i:2] md:mt-9">
            <BotaoTeste className="w-full">Testar grátis por {diasTeste} dias</BotaoTeste>
            <a
              href="#demonstracao"
              className="inline-flex min-h-14 items-center justify-between gap-4 rounded-[1.75rem] border border-white/25 bg-[#0a0a0a]/40 px-6 py-4 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/10"
              data-testid="ir-para-demonstracao"
            >
              <span>Montar um orçamento de exemplo</span>
              <ArrowDown className="size-5 shrink-0" aria-hidden />
            </a>
          </div>
          <ul className="ld-subir mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/70 [--i:3]">
            {['Sem cartão', 'Implantação assistida grátis', 'Cancele quando quiser'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4 text-[var(--ld-limao)]" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const SEGMENTOS = [
  'Buffet infantil',
  'Casamento e 15 anos',
  'Eventos e corporativo',
  'Buffet em domicílio',
];

/** 2. Para quem é: os tipos de buffet que já nascem com modelo pronto. */
export function ParaQuem() {
  return (
    <section className="border-y border-white/10 px-5 py-8" aria-labelledby="titulo-para-quem">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 id="titulo-para-quem" className="text-sm font-semibold text-white/60">
          Já vem com modelo pronto para
        </h2>
        <ul className="flex flex-wrap gap-2">
          {SEGMENTOS.map((s) => (
            <li
              key={s}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold"
            >
              {s}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const ROTINA = [
  {
    icone: MessageCircleQuestion,
    titulo: '"Me passa o valor?"',
    sem: 'O cliente pergunta no WhatsApp, você responde horas depois e ele já fechou com outro buffet.',
    com: 'Ele vê o preço na hora, no seu link, e você recebe o pedido pronto.',
  },
  {
    icone: NotebookPen,
    titulo: 'Caderno, planilha e conversa',
    sem: 'Data anotada em três lugares, pré-reserva esquecida e o risco de vender o mesmo sábado duas vezes.',
    com: 'Uma agenda só, com pré-reserva com prazo e o link que não vende data ocupada.',
  },
  {
    icone: Timer,
    titulo: 'Proposta e contrato na mão',
    sem: 'Orçamento no editor de texto, contrato impresso e parcelas anotadas no caderno.',
    com: 'Proposta com a sua marca, contrato assinado no celular e os pagamentos da festa no lugar.',
  },
];

/** 3. A rotina de hoje e a mesma rotina com o Orkestra. */
export function Rotina() {
  return (
    <section className="px-5 py-20 md:py-28" aria-labelledby="titulo-rotina">
      <div className="mx-auto max-w-6xl">
        <h2 id="titulo-rotina" className="ld-titulo max-w-2xl text-[2.4rem] md:text-6xl">
          Você conhece essa{' '}
          <span className="ld-serif text-[1.1em] text-[var(--ld-limao)]">rotina</span>.
        </h2>
        <ul className="mt-12 grid gap-4 lg:grid-cols-3">
          {ROTINA.map(({ icone: Icone, titulo, sem, com }) => (
            <li
              key={titulo}
              className="flex flex-col rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6"
            >
              <Icone className="size-7 text-[var(--ld-limao)]" aria-hidden />
              <h3 className="mt-4 text-xl font-bold">{titulo}</h3>
              <p className="mt-3 flex gap-2 text-white/65">
                <X className="mt-1 size-4 shrink-0 text-white/40" aria-hidden />
                <span>{sem}</span>
              </p>
              <p className="mt-auto flex gap-2 border-t border-white/10 pt-4 font-semibold">
                <Check className="mt-1 size-4 shrink-0 text-[var(--ld-limao)]" aria-hidden />
                <span>{com}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const PASSOS = [
  {
    titulo: 'Cadastre seus pacotes',
    texto:
      'A conta já nasce com o modelo do seu tipo de buffet. Você troca pelos seus preços, com a nossa ajuda na implantação.',
  },
  {
    titulo: 'Divulgue o seu link',
    texto:
      'Na bio do Instagram, no WhatsApp Business e no QR code da recepção. Os textos já vêm prontos.',
  },
  {
    titulo: 'Receba e feche',
    texto:
      'O pedido chega com data, convidados e valor. Daí em diante: proposta, contrato e pagamentos.',
  },
];

/** 5. Como funciona, em três passos. */
export function ComoFunciona() {
  return (
    <section
      id="como-funciona"
      className="ld-gelo scroll-mt-16 rounded-t-[2rem] px-5 py-20 md:rounded-t-[3rem] md:py-28"
      aria-labelledby="titulo-como-funciona"
    >
      <div className="mx-auto max-w-6xl">
        <p className="text-primary-texto text-sm font-bold tracking-[0.14em] uppercase">
          Como funciona
        </p>
        <h2
          id="titulo-como-funciona"
          className="ld-titulo mt-3 max-w-2xl text-[2.4rem] md:text-6xl"
        >
          Do cadastro ao primeiro pedido.
        </h2>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className="bg-card rounded-[1.75rem] border p-6">
              <span className="ld-titulo grid size-12 place-items-center rounded-2xl bg-[var(--ld-limao)] text-2xl text-[#0a0a0a]">
                {i + 1}
              </span>
              <h3 className="mt-5 text-xl font-bold">{p.titulo}</h3>
              <p className="text-muted-foreground mt-2">{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const RECURSOS = [
  {
    icone: Link2,
    titulo: 'Link de orçamento',
    texto: 'Pacotes, convidados por idade, extras, dia da semana e feriados. O preço sai certo.',
  },
  {
    icone: Store,
    titulo: 'Página do seu buffet',
    texto: 'Fotos, diferenciais, perguntas frequentes e a sua cor, prontas para divulgar.',
  },
  {
    icone: CalendarCheck,
    titulo: 'Agenda sem conflito',
    texto: 'Turnos, espaços, bloqueios e pré-reserva com prazo. O link não vende data ocupada.',
  },
  {
    icone: FileText,
    titulo: 'Proposta com a sua marca',
    texto: 'Na web e em PDF, com versões. Você vê quando o cliente abre.',
  },
  {
    icone: FileSignature,
    titulo: 'Contrato digital',
    texto: 'Montado a partir da reserva e assinado pelo cliente no celular.',
  },
  {
    icone: Wallet,
    titulo: 'Pagamentos da festa',
    texto: 'Plano de parcelas, recebimentos e atrasos de cada festa em um lugar.',
  },
  {
    icone: KanbanSquare,
    titulo: 'Leads em funil',
    texto: 'Quem é novo, quem está em conversa, quem esfriou. E tarefas para cada retorno.',
  },
  {
    icone: BellRing,
    titulo: 'Avisos no celular',
    texto: 'Pedido novo, cliente esquentando e pré-reserva perto de vencer avisam a equipe.',
  },
  {
    icone: BarChart3,
    titulo: 'Números do buffet',
    texto: 'De onde vêm os pedidos, por que você perde e quais datas ainda estão livres.',
  },
];

/** 6. Recursos: o caminho inteiro, do primeiro contato à festa. */
export function Recursos() {
  return (
    <section
      id="recursos"
      className="ld-gelo scroll-mt-16 px-5 pb-20 md:pb-28"
      aria-labelledby="titulo-recursos"
    >
      <div className="mx-auto max-w-6xl">
        <p className="text-primary-texto text-sm font-bold tracking-[0.14em] uppercase">Recursos</p>
        <h2 id="titulo-recursos" className="ld-titulo mt-3 max-w-3xl text-[2.4rem] md:text-6xl">
          Do primeiro contato à{' '}
          <span className="ld-serif text-primary-texto text-[1.1em]">festa</span>.
        </h2>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:mt-12 lg:grid-cols-3">
          {RECURSOS.map(({ icone: Icone, titulo, texto }) => (
            <li
              key={titulo}
              className="bg-card flex gap-4 rounded-[1.5rem] border p-4 sm:flex-col sm:rounded-[1.75rem] sm:p-6"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#0a0a0a] text-[var(--ld-limao)] sm:size-12">
                <Icone className="size-5 sm:size-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-bold">{titulo}</h3>
                <p className="text-muted-foreground mt-1 text-[0.95rem] sm:mt-1.5 sm:text-base">
                  {texto}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** 7. O painel por dentro (e a entrada na conta de demonstração, quando ligada). */
export function PainelPorDentro({ demoLigada }: { demoLigada: boolean }) {
  return (
    <section className="px-5 py-20 md:py-28" aria-labelledby="titulo-painel">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div>
          <h2 id="titulo-painel" className="ld-titulo text-[2.4rem] md:text-6xl">
            Seu dia em uma{' '}
            <span className="ld-serif text-[1.1em] text-[var(--ld-limao)]">tela</span>.
          </h2>
          <p className="mt-5 max-w-md text-lg text-white/70">
            Cada pedido vira um card no funil. O Orkestra mostra quem precisa de retorno hoje e
            deixa a mensagem pronta para você enviar pelo seu WhatsApp.
          </p>
          {demoLigada && (
            <form action="/demo/entrar" method="post" className="mt-8">
              <button
                type="submit"
                className="inline-flex min-h-14 items-center rounded-[1.75rem] border border-white/20 px-6 text-base font-bold transition-colors hover:bg-white/5"
                data-testid="ver-painel-demo"
              >
                Ver o painel de demonstração
              </button>
            </form>
          )}
        </div>
        <PainelDeExemplo />
      </div>
    </section>
  );
}

/** 8. Preço: um só, com tudo o que inclui. `preco` já formatado ("R$ 247"). */
export function Preco({
  preco,
  diasTeste,
  itens,
}: {
  preco: string | null;
  diasTeste: number;
  itens: string[];
}) {
  return (
    <section
      id="preco"
      className="ld-gelo scroll-mt-16 rounded-t-[2rem] px-5 py-20 md:rounded-t-[3rem] md:py-28"
      aria-labelledby="titulo-preco"
    >
      <div className="mx-auto grid max-w-6xl gap-8 rounded-[2rem] bg-[var(--ld-limao)] p-7 text-[#0a0a0a] md:p-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div className="flex flex-col">
          <h2 id="titulo-preco" className="text-sm font-bold tracking-[0.14em] uppercase">
            Um preço só, tudo incluso
          </h2>
          {preco ? (
            <p className="mt-4 flex flex-wrap items-baseline gap-x-3" data-testid="preco">
              <span className="ld-titulo text-[4.5rem] md:text-8xl">{preco}</span>
              <span className="ld-serif text-[2.5rem] md:text-6xl">por mês</span>
            </p>
          ) : (
            <p className="ld-titulo mt-4 text-5xl md:text-7xl" data-testid="preco-indisponivel">
              Comece grátis
            </p>
          )}
          <ul className="mt-6 space-y-2 text-lg font-semibold">
            <li className="flex items-center gap-3">
              <Check className="size-5 shrink-0" aria-hidden />
              {diasTeste} dias grátis, sem cartão
            </li>
            <li className="flex items-center gap-3">
              <Check className="size-5 shrink-0" aria-hidden />
              Implantação assistida grátis
            </li>
            <li className="flex items-center gap-3">
              <Check className="size-5 shrink-0" aria-hidden />
              Cancele quando quiser
            </li>
          </ul>
          <Link
            href="/cadastro"
            data-cta-teste
            className="mt-8 inline-flex min-h-14 w-full max-w-md items-center justify-between gap-4 rounded-[1.75rem] bg-[#0a0a0a] px-6 py-4 text-base font-bold text-[var(--ld-limao)] transition-colors hover:bg-[#1a1a1a] focus-visible:ring-[3px] focus-visible:ring-black/50 focus-visible:outline-none"
            data-testid="preco-testar"
          >
            Começar meu teste grátis
            <ArrowDown className="size-5 shrink-0 -rotate-90" aria-hidden />
          </Link>
        </div>
        <div className="rounded-[1.5rem] bg-[#0a0a0a]/[0.06] p-6">
          <p className="font-bold">O que está incluso</p>
          <ul className="mt-4 grid gap-2.5" data-testid="preco-inclui">
            {itens.map((i) => (
              <li key={i} className="flex items-start gap-3">
                <Check className="mt-0.5 size-5 shrink-0" aria-hidden />
                {i}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** 9. Dúvidas frequentes (sem JavaScript: details/summary). */
export function Duvidas({ duvidas }: { duvidas: Duvida[] }) {
  return (
    <section
      id="duvidas"
      className="ld-gelo scroll-mt-16 px-5 pb-24 md:pb-32"
      aria-labelledby="titulo-duvidas"
    >
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-primary-texto text-sm font-bold tracking-[0.14em] uppercase">
            Dúvidas
          </p>
          <h2 id="titulo-duvidas" className="ld-titulo mt-3 text-[2.4rem] md:text-6xl">
            Perguntas de quem está começando.
          </h2>
        </div>
        <ul className="divide-y rounded-[1.75rem] border bg-white" data-testid="lista-duvidas">
          {duvidas.map((d) => (
            <li key={d.pergunta}>
              <details className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-lg font-bold [&::-webkit-details-marker]:hidden">
                  {d.pergunta}
                  <ChevronDown
                    className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden
                  />
                </summary>
                <p className="text-muted-foreground px-5 pb-5">{d.resposta}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** 10. Chamada final: cadastro e, se configurado, o WhatsApp de vendas. */
export function ChamadaFinal({
  diasTeste,
  whatsappVendas,
}: {
  diasTeste: number;
  whatsappVendas: string | null;
}) {
  return (
    <section className="px-5 py-24 md:py-32" aria-labelledby="titulo-final">
      <div className="mx-auto flex max-w-md flex-col items-start lg:max-w-5xl lg:items-center lg:text-center">
        <h2 id="titulo-final" className="ld-titulo text-[2.6rem] md:text-7xl">
          Agora com a <span className="ld-serif text-[1.1em] text-[var(--ld-limao)]">sua</span>{' '}
          marca.
        </h2>
        <p className="mt-5 max-w-lg text-lg text-white/70">
          Coloque o link do seu buffet no ar e receba o primeiro pedido organizado.
        </p>
        <BotaoTeste className="mt-9 w-full max-w-md">
          Quero isso com o nome do meu buffet
        </BotaoTeste>
        <p className="mt-4 text-sm text-white/55">{diasTeste} dias grátis, sem cartão.</p>
        {whatsappVendas && (
          <a
            href={`https://wa.me/${whatsappVendas}`}
            className="mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline"
            data-testid="whatsapp-vendas"
          >
            <IconeWhatsApp className="size-5 text-[var(--ld-verde)]" />
            Prefere conversar? Fale com a gente no WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}

export function Rodape({ whatsappVendas }: { whatsappVendas: string | null }) {
  const email = process.env.NEXT_PUBLIC_EMAIL_CONTATO || null;
  const razao = process.env.NEXT_PUBLIC_RAZAO_SOCIAL || null;
  const link =
    'inline-flex min-h-11 items-center rounded-sm text-white/60 transition-colors hover:text-white';
  const colunas: {
    titulo: string;
    links: { href: string; rotulo: string; externo?: boolean }[];
  }[] = [
    {
      titulo: 'Produto',
      links: NAV.map(([href, rotulo]) => ({ href, rotulo })),
    },
    {
      titulo: 'Conta',
      links: [
        { href: '/cadastro', rotulo: 'Testar grátis' },
        { href: '/login', rotulo: 'Entrar' },
      ],
    },
    {
      titulo: 'Legal',
      links: [
        { href: '/termos', rotulo: 'Termos de uso' },
        { href: '/privacidade', rotulo: 'Privacidade' },
        { href: '/subprocessadores', rotulo: 'Subprocessadores' },
      ],
    },
  ];
  const contato = [
    email && { href: `mailto:${email}`, rotulo: email, externo: true },
    whatsappVendas && {
      href: `https://wa.me/${whatsappVendas}`,
      rotulo: 'WhatsApp',
      externo: true,
    },
  ].filter((x): x is { href: string; rotulo: string; externo: boolean } => Boolean(x));
  if (contato.length) colunas.push({ titulo: 'Contato', links: contato });

  return (
    <footer className="border-t border-white/10 px-5 pt-14 pb-8 text-sm">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-white/60">
              O sistema de vendas do buffet: link de orçamento, agenda, proposta, contrato e
              pagamentos.
            </p>
          </div>
          {colunas.map((c) => (
            <nav key={c.titulo} aria-label={c.titulo}>
              <p className="font-semibold">{c.titulo}</p>
              <ul className="mt-2">
                {c.links.map((l) => (
                  <li key={l.href}>
                    {l.href.startsWith('/') ? (
                      <Link
                        href={l.href}
                        className={link}
                        data-cta-teste={l.href === '/cadastro' ? '' : undefined}
                      >
                        {l.rotulo}
                      </Link>
                    ) : (
                      <a href={l.href} className={cn(link, 'break-all')}>
                        {l.rotulo}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="mt-10 border-t border-white/10 pt-6 text-xs text-white/50">
          © {new Date().getFullYear()} Orkestra{razao ? ` · ${razao}` : ''}
        </p>
      </div>
    </footer>
  );
}

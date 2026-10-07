import {
  ArrowUpRight,
  BarChart3,
  BellRing,
  CalendarCheck,
  Clock,
  Contact,
  FileText,
  Hourglass,
  Link2,
  MessageCircleQuestion,
  PhoneOff,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Logo } from '@/components/app/logo';
import { Logotipo } from '@/components/marca/logotipo';
import { planoDoRecurso, type PlanoVitrine } from '@/domain/marketing';
import { cn } from '@/lib/utils';
import { BotaoTeste, BotaoWhatsappVendas, linkWhatsappVendas } from './ctas';

/** Título de seção: um sobretítulo curto com o traço limão e o título grande. */
export function TituloSecao({
  id,
  sobre,
  titulo,
  destaque,
  texto,
  centro = false,
}: {
  id: string;
  sobre: string;
  titulo: string;
  /** final do título em limão (opcional) */
  destaque?: string;
  texto?: string;
  centro?: boolean;
}) {
  return (
    <div className={cn('max-w-3xl', centro && 'mx-auto text-center')}>
      <p
        className={cn(
          'text-primary-texto inline-flex items-center gap-2.5 text-xs font-bold tracking-[0.18em] uppercase',
        )}
      >
        <span aria-hidden className="bg-primary h-px w-8" />
        {sobre}
      </p>
      <h2
        id={id}
        className="mt-4 text-[2.1rem] leading-[1.06] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl"
      >
        {titulo}
        {destaque && (
          <>
            {' '}
            <span className="ld-texto-limao">{destaque}</span>
          </>
        )}
      </h2>
      {texto && (
        <p className="text-muted-foreground mt-5 text-lg leading-relaxed text-pretty">{texto}</p>
      )}
    </div>
  );
}

const DORES = [
  {
    icone: MessageCircleQuestion,
    titulo: 'Todo mundo pergunta "quanto custa?"',
    texto: 'Você passa o dia respondendo a mesma conta no WhatsApp, e muita gente some depois.',
  },
  {
    icone: Hourglass,
    titulo: 'O orçamento demora e o cliente chama outro buffet',
    texto: 'Quem responde primeiro leva a festa. À noite e no fim de semana, ninguém responde.',
  },
  {
    icone: PhoneOff,
    titulo: 'Ninguém lembra de dar retorno',
    texto: 'O contato fica perdido na conversa e a data que ele queria vai para outro.',
  },
];

export function Problema() {
  return (
    <section className="relative py-24 md:py-32" aria-labelledby="titulo-problema">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-problema"
          sobre="Conhece essa rotina?"
          titulo="O telefone não para,"
          destaque="mas a agenda não enche."
        />
        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {DORES.map((d, i) => (
            <li
              key={d.titulo}
              className="ld-vidro ld-holofote ld-cartao ld-revelar rounded-[28px] p-7"
              style={{ animationRangeStart: `entry ${i * 10}%` }}
            >
              <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/5">
                <d.icone className="text-primary-texto size-6" aria-hidden />
              </span>
              <h3 className="mt-6 text-xl leading-snug font-bold">{d.titulo}</h3>
              <p className="text-muted-foreground mt-3 leading-relaxed">{d.texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const PASSOS = [
  {
    titulo: 'O cliente monta o orçamento no seu link',
    texto: 'Escolhe a festa, a data, os convidados e o pacote, e vê o valor na hora.',
  },
  {
    titulo: 'Você recebe o contato com o valor e a data',
    texto: 'O lead chega pronto, com o que ele escolheu e o WhatsApp para falar com ele.',
  },
  {
    titulo: 'Você confirma a pré-reserva e acompanha até fechar',
    texto: 'A data fica segura, a proposta sai com a sua marca e o Orkestra lembra do retorno.',
  },
];

/** Passos 01/02/03: o do meio começa em limão e o destaque segue o ponteiro (CSS). */
export function ComoFunciona() {
  return (
    <section
      id="como-funciona"
      className="relative scroll-mt-24 py-24 md:py-32"
      aria-labelledby="titulo-como"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-como"
          sobre="Como funciona"
          titulo="Três passos, do link"
          destaque="à festa marcada."
        />
        <ol className="ld-passos ld-revelar mt-14 grid overflow-hidden rounded-[28px] border border-white/10 md:grid-cols-3">
          {PASSOS.map((p, i) => (
            <li
              key={p.titulo}
              className="ld-passo flex min-h-64 flex-col border-white/10 p-8 not-last:border-b md:not-last:border-r md:not-last:border-b-0"
              data-destaque={i === 1 || undefined}
            >
              <span className="text-4xl font-extrabold tracking-tight tabular-nums">0{i + 1}.</span>
              <h3 className="mt-auto pt-10 text-xl leading-snug font-bold">{p.titulo}</h3>
              <p className="ld-passo-texto mt-3 leading-relaxed">{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Funcionalidades({ planos }: { planos: PlanoVitrine[] }) {
  const profissional = (r: 'followUp' | 'whatsappAvisos' | 'numerosCompleto') =>
    planoDoRecurso(planos, r);
  const avisos = profissional('followUp') ?? profissional('whatsappAvisos');
  const numeros = profissional('numerosCompleto');
  const itens = [
    {
      icone: CalendarCheck,
      titulo: 'Pré-reserva sem conflito de data',
      texto:
        'A data fica segura por um prazo, e a agenda não deixa marcar duas festas no mesmo horário.',
    },
    {
      icone: Contact,
      titulo: 'Seus clientes organizados',
      texto:
        'Um CRM simples: cada contato com valor, data, histórico e o próximo passo, na ordem de quem atender primeiro.',
    },
    {
      icone: BellRing,
      titulo: 'Follow-up automático e avisos',
      texto:
        'O Orkestra cria a tarefa de retorno sozinho e avisa você no celular e no WhatsApp quando alguém quer reservar.',
      etiqueta: avisos,
    },
    {
      icone: FileText,
      titulo: 'Propostas em PDF com a sua marca',
      texto: 'Proposta na web e em PDF, com validade, condições e o cardápio do pacote.',
    },
  ];
  return (
    <section className="relative py-24 md:py-32" aria-labelledby="titulo-funcoes">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-funcoes"
          sobre="O que vem junto"
          titulo="Tudo o que o buffet precisa para vender,"
          destaque="num lugar só."
        />
        <ul className="mt-14 grid gap-4 md:grid-cols-6">
          {/* o link: cartão grande, com o valor sendo calculado */}
          <li className="ld-vidro ld-holofote ld-revelar relative overflow-hidden rounded-[28px] p-7 md:col-span-4 md:row-span-2 md:p-9">
            <Link2 className="text-primary-texto size-7" aria-hidden />
            <h3 className="mt-6 text-2xl font-bold">Link de orçamento automático</h3>
            <p className="text-muted-foreground mt-3 max-w-md leading-relaxed">
              O cliente vê o valor na hora, calculado com os seus pacotes, preços e regras. De dia,
              de noite e no fim de semana.
            </p>
            <div aria-hidden className="mt-10 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2.5">
                {[
                  ['Pacote Super', '60 convidados'],
                  ['Mesa de doces', 'opcional'],
                  ['Hora extra', '1 h'],
                ].map(([a, b]) => (
                  <div
                    key={a}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
                  >
                    <span className="font-semibold">{a}</span>
                    <span className="text-white/55">{b}</span>
                  </div>
                ))}
              </div>
              <div className="bg-primary text-primary-foreground rounded-3xl px-6 py-5">
                <p className="text-xs font-semibold opacity-75">Total na hora</p>
                <p className="text-3xl font-extrabold tracking-tight tabular-nums">R$ 4.900</p>
              </div>
            </div>
          </li>
          {/* números: gráfico desenhando ao rolar */}
          <li className="ld-vidro ld-holofote ld-revelar relative overflow-hidden rounded-[28px] p-7 md:col-span-2 md:row-span-2">
            <div className="flex items-start justify-between gap-3">
              <BarChart3 className="text-primary-texto size-7" aria-hidden />
              {numeros && (
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs font-bold">
                  Completo no {numeros}
                </span>
              )}
            </div>
            <h3 className="mt-6 text-xl font-bold">Números do mês</h3>
            <p className="text-muted-foreground mt-3 leading-relaxed">
              Quantos abriram o link, quantos pediram orçamento e quantos fecharam.
            </p>
            <svg aria-hidden viewBox="0 0 240 120" className="mt-8 w-full overflow-visible">
              <defs>
                <linearGradient id="ld-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#B2F759" stopOpacity="0.28" />
                  <stop offset="1" stopColor="#B2F759" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 100 C 30 96, 45 70, 75 74 S 120 92, 145 60 S 200 20, 240 14 L 240 120 L 0 120 Z"
                fill="url(#ld-area)"
              />
              <path
                d="M0 100 C 30 96, 45 70, 75 74 S 120 92, 145 60 S 200 20, 240 14"
                fill="none"
                stroke="#B2F759"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="400"
                className="ld-desenhar"
                style={{ ['--comprimento' as string]: 400 }}
              />
              {[
                [75, 74],
                [145, 60],
                [240, 14],
              ].map(([x, y]) => (
                <circle
                  key={x}
                  cx={x}
                  cy={y}
                  r="4.5"
                  fill="#070707"
                  stroke="#B2F759"
                  strokeWidth="2"
                />
              ))}
            </svg>
          </li>
          {itens.map((f) => (
            <li
              key={f.titulo}
              className="ld-vidro ld-holofote ld-cartao ld-revelar rounded-[28px] p-7 md:col-span-3"
            >
              <div className="flex items-start justify-between gap-3">
                <f.icone className="text-primary-texto size-7" aria-hidden />
                {f.etiqueta && (
                  <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs font-bold">
                    {f.etiqueta}
                  </span>
                )}
              </div>
              <h3 className="mt-6 text-xl font-bold">{f.titulo}</h3>
              <p className="text-muted-foreground mt-3 leading-relaxed">{f.texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const ESTILOS = [
  { chave: 'festivo', nome: 'Festivo', texto: 'Cores e formas alegres, para festa infantil.' },
  {
    chave: 'elegante',
    nome: 'Elegante',
    texto: 'Títulos finos e filetes, para casamentos e eventos.',
  },
  { chave: 'limpo', nome: 'Limpo', texto: 'Direto e leve, para qualquer buffet.' },
] as const;

/** Posição de cada celular no PC: o do meio um pouco acima (as imagens já vêm inclinadas). */
const DESLOCAMENTO = ['md:translate-y-10', 'md:-translate-y-2', 'md:translate-y-10'];

export function SuaPagina() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32" aria-labelledby="titulo-pagina">
      <div
        aria-hidden
        className="ld-brilho pointer-events-none absolute top-1/2 left-1/2 size-[46rem] -translate-x-1/2 rounded-full opacity-70"
      />
      <div className="relative mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-pagina"
          sobre="Sua página, sua cara"
          titulo="O seu cliente vê uma página bonita,"
          destaque="com a cor e as fotos do seu buffet."
          texto="Logo, capa, pacotes, galeria, perguntas frequentes e o botão de orçamento. Você escolhe o estilo e muda quando quiser."
          centro
        />
        <ul className="-mx-4 mt-12 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-6 md:mx-0 md:grid md:grid-cols-3 md:gap-0 md:overflow-visible md:px-0">
          {ESTILOS.map((e, i) => (
            <li
              key={e.chave}
              className={cn(
                'group w-72 shrink-0 snap-center mix-blend-lighten md:w-auto',
                DESLOCAMENTO[i],
              )}
            >
              <div className="ld-flutuar" style={{ ['--atraso' as string]: `${i * -2}s` }}>
                <Image
                  src={`/landing/estilo-${e.chave}-1120.webp`}
                  alt={`Página de um buffet de exemplo no estilo ${e.nome.toLowerCase()}, vista no celular`}
                  width={1120}
                  height={1400}
                  sizes="(min-width: 1024px) 368px, (min-width: 768px) 33vw, 288px"
                  loading="lazy"
                  className="h-auto w-full transition-transform duration-500 group-hover:-translate-y-2 group-hover:scale-[1.03]"
                />
              </div>
              <p className="text-muted-foreground relative text-center text-sm">{e.texto}</p>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground/80 mt-6 text-center text-xs">Buffets de exemplo</p>
      </div>
    </section>
  );
}

export function Perguntas({ planos, diasTeste }: { planos: PlanoVitrine[]; diasTeste: number }) {
  const espacos = planos.length
    ? planos
        .map((p) =>
          p.maxEspacos === null
            ? `no ${p.nome}, quantos espaços precisar`
            : `no ${p.nome}, ${p.maxEspacos === 1 ? '1 espaço' : `até ${p.maxEspacos} espaços`}`,
        )
        .join('; ')
    : null;
  const whats = linkWhatsappVendas();
  const perguntas: { p: string; r: React.ReactNode }[] = [
    {
      p: 'Preciso de cartão para testar?',
      r: `Não. São ${diasTeste} dias grátis, com todos os recursos, sem cadastrar cartão. Só no fim do teste você escolhe se quer assinar.`,
    },
    {
      p: 'Posso cancelar quando quiser?',
      r: 'Pode. Você cancela pela tela Plano, sem multa e sem precisar falar com ninguém.',
    },
    {
      p: 'Meus dados e os dos meus clientes ficam seguros?',
      r: (
        <>
          Cada buffet só vê os próprios dados, o suporte só entra na sua conta com a sua permissão e
          por tempo limitado, e o Orkestra não guarda o IP de quem visita o seu link. Seguimos a
          LGPD: veja a{' '}
          <Link href="/privacidade" className="text-primary-texto font-semibold underline">
            Política de Privacidade
          </Link>
          .
        </>
      ),
    },
    {
      p: 'Funciona no celular?',
      r: 'Foi feito primeiro para o celular: o seu cliente monta o orçamento pelo celular e você atende pelo celular. No computador também funciona.',
    },
    {
      p: 'Preciso instalar alguma coisa?',
      r: 'Não. Funciona no navegador. Se quiser, adicione à tela inicial do celular para receber os avisos como um aplicativo.',
    },
    {
      p: 'Como o cliente paga o sinal?',
      r: 'Hoje o Orkestra não recebe pagamentos do seu cliente. A proposta mostra o sinal e as condições que você definiu, e o pagamento é combinado direto com você (Pix, cartão, como preferir). Quando receber, você confirma a reserva no Orkestra.',
    },
    {
      p: 'Posso usar mais de um espaço?',
      r: espacos
        ? `Pode, conforme o plano: ${espacos}. A agenda controla cada espaço e turno separadamente.`
        : 'Pode. A agenda controla cada espaço e turno separadamente; o número de espaços depende do plano.',
    },
    {
      p: 'Como passo meus contatos para o Orkestra?',
      r: (
        <>
          Ainda não há importação automática. Os clientes novos entram sozinhos pelo seu link, e os
          que já estão em negociação você cadastra em poucos segundos pelo botão + Orçamento.
          {whats && (
            <>
              {' '}
              Se quiser ajuda,{' '}
              <a href={whats} className="text-primary-texto font-semibold underline">
                fale com a gente no WhatsApp
              </a>
              .
            </>
          )}
        </>
      ),
    },
  ];
  return (
    <section
      id="perguntas"
      className="relative scroll-mt-24 py-24 md:py-32"
      aria-labelledby="titulo-perguntas"
    >
      <div className="mx-auto grid max-w-6xl gap-12 px-4 md:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <TituloSecao
            id="titulo-perguntas"
            sobre="Perguntas frequentes"
            titulo="Ficou alguma"
            destaque="dúvida?"
            texto="Se a sua não estiver aqui, chame a gente no WhatsApp."
          />
        </div>
        <div className="space-y-3">
          {perguntas.map((q) => (
            <details
              key={q.p}
              className="group ld-vidro rounded-3xl px-6 py-1 transition-colors open:border-[rgb(178_247_89/0.35)] [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-semibold">
                {q.p}
                <span
                  aria-hidden
                  className="group-open:bg-primary group-open:text-primary-foreground grid size-8 shrink-0 place-items-center rounded-full border border-white/15 text-xl leading-none transition-[transform,background-color] duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="text-muted-foreground max-w-prose pb-6 leading-relaxed">{q.r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ChamadaFinal({ diasTeste }: { diasTeste: number }) {
  return (
    <section
      className="relative overflow-hidden px-3 py-16 md:py-24"
      aria-labelledby="titulo-final"
    >
      <div className="bg-primary text-primary-foreground ld-revelar relative mx-auto max-w-6xl overflow-hidden rounded-[36px] px-6 py-16 text-center md:px-12 md:py-24">
        <Logotipo
          titulo=""
          className="pointer-events-none absolute -bottom-6 left-1/2 w-[140%] max-w-none -translate-x-1/2 text-black/[0.07]"
        />
        <div className="relative">
          <h2
            id="titulo-final"
            className="mx-auto max-w-3xl text-4xl leading-[1.04] font-extrabold tracking-[-0.035em] text-balance sm:text-6xl"
          >
            Seu próximo cliente já está pedindo orçamento.
          </h2>
          <p className="mt-5 text-lg font-medium opacity-80">Deixe o link responder por você.</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <BotaoTeste className="bg-[#0c0c0c] text-[#f4f4f2] hover:bg-black">
              Testar {diasTeste} dias grátis
            </BotaoTeste>
            <BotaoWhatsappVendas className="min-h-13 border-black/25 px-7 text-base hover:bg-black/5" />
          </div>
          <p className="mt-7 flex items-center justify-center gap-2 text-sm font-semibold opacity-80">
            <Clock className="size-4" aria-hidden />
            Seu link fica pronto em minutos.
          </p>
        </div>
      </div>
    </section>
  );
}

export function Rodape() {
  const whats = linkWhatsappVendas();
  const email = process.env.NEXT_PUBLIC_EMAIL_CONTATO || null;
  const razao = process.env.NEXT_PUBLIC_RAZAO_SOCIAL || null;
  return (
    <footer className="bg-background text-foreground relative overflow-hidden border-t border-white/10 pt-14 pb-24 sm:pb-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 md:flex-row md:items-start md:justify-between md:px-6">
        <div className="space-y-4">
          <Logo />
          <p className="text-muted-foreground max-w-xs text-sm">
            Orçamento que vira festa marcada. Feito no Brasil para buffets de festas.
          </p>
        </div>
        <nav aria-label="Rodapé" className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm">
          <Link href="/login" className="hover:text-primary-texto transition-colors">
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="hover:text-primary-texto transition-colors"
            data-cta-teste
          >
            Testar grátis
          </Link>
          <Link href="/termos" className="hover:text-primary-texto transition-colors">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="hover:text-primary-texto transition-colors">
            Privacidade
          </Link>
          <Link href="/subprocessadores" className="hover:text-primary-texto transition-colors">
            Subprocessadores
          </Link>
          {whats && (
            <a
              href={whats}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary-texto inline-flex items-center gap-1 transition-colors"
            >
              WhatsApp
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="hover:text-primary-texto transition-colors">
              {email}
            </a>
          )}
        </nav>
      </div>
      <p className="text-muted-foreground mx-auto mt-12 max-w-6xl px-4 text-xs md:px-6">
        © {new Date().getFullYear()} Orkestra{razao ? ` · ${razao}` : ''}
      </p>
      <Logotipo
        titulo=""
        className="pointer-events-none mx-auto mt-10 block w-[92%] max-w-6xl text-white/[0.04]"
      />
    </footer>
  );
}

import {
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
import { planoDoRecurso, type PlanoVitrine } from '@/domain/marketing';
import { cn } from '@/lib/utils';
import { BotaoTeste, BotaoWhatsappVendas, linkWhatsappVendas } from './ctas';

/** Título de seção: um "sobretítulo" curto em verde e o título. */
export function TituloSecao({
  id,
  sobre,
  titulo,
  texto,
  centro = false,
}: {
  id: string;
  sobre: string;
  titulo: string;
  texto?: string;
  centro?: boolean;
}) {
  return (
    <div className={cn('max-w-2xl', centro && 'mx-auto text-center')}>
      <p className="text-primary-texto text-sm font-bold tracking-wide uppercase">{sobre}</p>
      <h2 id={id} className="mt-2 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
        {titulo}
      </h2>
      {texto && <p className="text-muted-foreground mt-4 text-lg text-pretty">{texto}</p>}
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
    <section className="entrada py-20 md:py-28" aria-labelledby="titulo-problema">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-problema"
          sobre="Conhece essa rotina?"
          titulo="O telefone não para, mas a agenda não enche"
        />
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {DORES.map((d) => (
            <li key={d.titulo} className="bg-card rounded-card border p-6">
              <d.icone className="text-primary-texto size-7" aria-hidden />
              <h3 className="mt-4 text-lg font-bold">{d.titulo}</h3>
              <p className="text-muted-foreground mt-2">{d.texto}</p>
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

export function ComoFunciona() {
  return (
    <section
      id="como-funciona"
      className="entrada scroll-mt-20 py-20 md:py-28"
      aria-labelledby="titulo-como"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-como"
          sobre="Como funciona"
          titulo="Três passos, do link à festa marcada"
        />
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className="relative">
              <span className="bg-destaque text-destaque-foreground grid size-11 place-items-center rounded-full text-lg font-extrabold">
                {i + 1}
              </span>
              {i < PASSOS.length - 1 && (
                <span
                  aria-hidden
                  className="bg-border absolute top-5 left-14 hidden h-px w-[calc(100%-4rem)] md:block"
                />
              )}
              <h3 className="mt-5 text-lg font-bold">{p.titulo}</h3>
              <p className="text-muted-foreground mt-2">{p.texto}</p>
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
      icone: Link2,
      titulo: 'Link de orçamento automático',
      texto: 'O cliente vê o valor na hora, calculado com os seus pacotes, preços e regras.',
    },
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
    {
      icone: BarChart3,
      titulo: 'Números do mês',
      texto: 'Quantos abriram o link, quantos pediram orçamento e quantos fecharam.',
      etiqueta: numeros ? `Completo no ${numeros}` : null,
    },
  ];
  return (
    <section className="entrada py-20 md:py-28" aria-labelledby="titulo-funcoes">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-funcoes"
          sobre="O que vem junto"
          titulo="Tudo o que o buffet precisa para vender, num lugar só"
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map((f) => (
            <li key={f.titulo} className="bg-card rounded-card border p-6">
              <div className="flex items-start justify-between gap-3">
                <f.icone className="text-primary-texto size-7" aria-hidden />
                {f.etiqueta && (
                  <span className="bg-destaque text-destaque-foreground rounded-full px-2.5 py-1 text-xs font-bold">
                    {f.etiqueta}
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-lg font-bold">{f.titulo}</h3>
              <p className="text-muted-foreground mt-2">{f.texto}</p>
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

export function SuaPagina() {
  return (
    <section className="entrada py-20 md:py-28" aria-labelledby="titulo-pagina">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-pagina"
          sobre="Sua página, sua cara"
          titulo="O seu cliente vê uma página bonita, com a cor e as fotos do seu buffet"
          texto="Logo, capa, pacotes, galeria, perguntas frequentes e o botão de orçamento. Você escolhe o estilo e muda quando quiser."
        />
        <ul className="-mx-4 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {ESTILOS.map((e) => (
            <li key={e.chave} className="w-64 shrink-0 snap-center md:w-auto">
              <div className="mx-auto w-full max-w-[17rem] overflow-hidden rounded-[2rem] border-[6px] border-[#1a1a1a] bg-white shadow-xl">
                <Image
                  src={`/landing/vitrine-${e.chave}-640.webp`}
                  alt={`Página de um buffet no estilo ${e.nome.toLowerCase()}, vista no celular`}
                  width={640}
                  height={1280}
                  sizes="(min-width: 768px) 272px, 256px"
                  loading="lazy"
                  className="h-auto w-full"
                />
              </div>
              <p className="mt-4 text-center font-bold">{e.nome}</p>
              <p className="text-muted-foreground text-center text-sm">{e.texto}</p>
            </li>
          ))}
        </ul>
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
      className="entrada scroll-mt-20 py-20 md:py-28"
      aria-labelledby="titulo-perguntas"
    >
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <TituloSecao
          id="titulo-perguntas"
          sobre="Perguntas frequentes"
          titulo="Ficou alguma dúvida?"
        />
        <div className="rounded-card bg-card mt-10 divide-y border">
          {perguntas.map((q) => (
            <details
              key={q.p}
              className="group px-5 py-1 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-semibold">
                {q.p}
                <span
                  aria-hidden
                  className="text-primary-texto text-2xl leading-none transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="text-muted-foreground max-w-prose pb-5 leading-relaxed">{q.r}</p>
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
      className="dark bg-background text-foreground py-20 md:py-28"
      style={{
        backgroundImage:
          'radial-gradient(50% 60% at 50% 100%, rgb(62 228 46 / 0.14), transparent 70%)',
      }}
      aria-labelledby="titulo-final"
    >
      <div className="mx-auto max-w-3xl px-4 text-center md:px-6">
        <h2
          id="titulo-final"
          className="text-3xl font-extrabold tracking-tight text-balance sm:text-5xl"
        >
          Seu próximo cliente já está pedindo orçamento.
        </h2>
        <p className="text-muted-foreground mt-5 text-lg">Deixe o link responder por você.</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <BotaoTeste>Testar {diasTeste} dias grátis</BotaoTeste>
          <BotaoWhatsappVendas className="min-h-13 px-7 text-base" />
        </div>
        <p className="text-muted-foreground mt-6 flex items-center justify-center gap-2 text-sm">
          <Clock className="size-4" aria-hidden />
          Seu link fica pronto em minutos.
        </p>
      </div>
    </section>
  );
}

export function Rodape() {
  const whats = linkWhatsappVendas();
  const email = process.env.NEXT_PUBLIC_EMAIL_CONTATO || null;
  const razao = process.env.NEXT_PUBLIC_RAZAO_SOCIAL || null;
  return (
    <footer className="dark bg-background text-foreground border-t pt-12 pb-24 sm:pb-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 md:flex-row md:items-start md:justify-between md:px-6">
        <div className="space-y-3">
          <Logo />
          <p className="text-muted-foreground max-w-xs text-sm">
            Orçamento que vira festa marcada. Feito no Brasil para buffets de festas.
          </p>
        </div>
        <nav aria-label="Rodapé" className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
          <Link href="/login" className="hover:underline">
            Entrar
          </Link>
          <Link href="/cadastro" className="hover:underline" data-cta-teste>
            Testar grátis
          </Link>
          <Link href="/termos" className="hover:underline">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="hover:underline">
            Privacidade
          </Link>
          {whats && (
            <a href={whats} target="_blank" rel="noopener noreferrer" className="hover:underline">
              WhatsApp
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="hover:underline">
              {email}
            </a>
          )}
        </nav>
      </div>
      <p className="text-muted-foreground mx-auto mt-10 max-w-6xl px-4 text-xs md:px-6">
        © {new Date().getFullYear()} Orkestra{razao ? ` · ${razao}` : ''}
      </p>
    </footer>
  );
}

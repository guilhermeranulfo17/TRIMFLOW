import {
  ArrowUpRight,
  BarChart3,
  CalendarCheck,
  Calculator,
  ClipboardList,
  FileSignature,
  Image as IconeImagem,
  ListChecks,
  MessageCircleQuestion,
  Repeat,
  Search,
  UserCog,
  Wallet,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Logo } from '@/components/app/logo';
import { Logotipo } from '@/components/marca/logotipo';
import { planoDoRecurso, type PlanoVitrine } from '@/domain/marketing/precos-vitrine';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import { BotaoTeste, BotaoWhatsappVendas, linkWhatsappVendas } from './ctas';

/** Título de seção: o título grande (final em limão) e, se houver, o texto de apoio. */
export function TituloSecao({
  id,
  titulo,
  destaque,
  texto,
  centro = false,
}: {
  id: string;
  titulo: string;
  /** final do título em limão (opcional) */
  destaque?: string;
  texto?: string;
  centro?: boolean;
}) {
  return (
    <div className={cn('max-w-3xl', centro && 'mx-auto text-center')}>
      <h2
        id={id}
        className="text-[2rem] leading-[1.08] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl"
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

/** Etiqueta "Profissional" num recurso que o plano mais barato não tem (vem dos dados). */
function EtiquetaPlano({ plano, texto }: { plano: string | null; texto?: string }) {
  if (!plano) return null;
  return (
    <span className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-xs font-bold">
      {texto ? `${texto} no ${plano}` : `No ${plano}`}
    </span>
  );
}

const SITUACOES = [
  {
    icone: Calculator,
    titulo: 'A mesma conta, várias vezes no WhatsApp',
    texto: 'Cada família pede o valor para outra data, outro pacote e outro número de convidados.',
    solucao: 'O link calcula com os seus pacotes e regras, e você recebe o que o cliente escolheu.',
  },
  {
    icone: MessageCircleQuestion,
    titulo: 'A proposta que ficou sem retorno',
    texto: 'No meio de tantas conversas, um orçamento enviado acaba esquecido.',
    solucao: 'Tarefas de retorno e mensagens prontas mostram quem chamar e quando.',
  },
  {
    icone: Search,
    titulo: 'Data, contrato e pagamento em lugares diferentes',
    texto: 'Agenda no caderno, contrato numa pasta e o sinal no extrato do banco.',
    solucao: 'Agenda, contrato e recebimentos ficam ligados à mesma festa.',
  },
];

export function Problema() {
  return (
    <section className="relative py-20 md:py-28" aria-labelledby="titulo-problema">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-problema"
          titulo="O atendimento toma o dia,"
          destaque="e a organização fica para depois."
        />
        {/* no PC, as linhas dos três cartões se alinham (subgrid): o "Com o Orkestra" fica na mesma altura */}
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {SITUACOES.map((d) => (
            <li
              key={d.titulo}
              className="ld-vidro flex flex-col rounded-[28px] p-6 md:row-span-4 md:grid md:grid-rows-subgrid md:gap-0 md:p-7"
            >
              <d.icone className="text-primary-texto size-7" aria-hidden />
              <h3 className="mt-5 text-xl leading-snug font-bold">{d.titulo}</h3>
              <p className="text-muted-foreground mt-2 leading-relaxed">{d.texto}</p>
              <p className="mt-5 border-t border-white/10 pt-4 leading-relaxed">
                <span className="text-primary-texto block text-xs font-bold tracking-wide uppercase">
                  Com o Orkestra
                </span>
                {d.solucao}
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
    titulo: 'Configure seus pacotes',
    texto: 'Cadastre preços, regras, fotos e condições. O cadastro já começa com um modelo.',
  },
  {
    titulo: 'Divulgue seu link',
    texto: 'Use na bio, no WhatsApp, no QR code impresso e nos canais do buffet.',
  },
  {
    titulo: 'Receba e acompanhe os interessados',
    texto: 'Veja o que cada um escolheu e organize os próximos contatos da equipe.',
  },
  {
    titulo: 'Organize o fechamento',
    texto: 'Acompanhe a reserva, o contrato e os valores a receber de cada festa.',
  },
];

/** Passos 01 a 04: o segundo começa em limão e o destaque segue o ponteiro (CSS). */
export function ComoFunciona() {
  return (
    <section
      id="como-funciona"
      className="relative scroll-mt-24 py-20 md:py-28"
      aria-labelledby="titulo-como"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-como"
          titulo="Quatro passos,"
          destaque="do cadastro à festa fechada."
        />
        <ol className="ld-passos mt-12 grid overflow-hidden rounded-[28px] border border-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {PASSOS.map((p, i) => (
            <li
              key={p.titulo}
              className="ld-passo flex min-h-56 flex-col border-white/10 p-7 not-last:border-b lg:not-last:border-r lg:not-last:border-b-0 sm:[&:nth-child(-n+2)]:border-b lg:[&:nth-child(-n+2)]:border-b-0 sm:[&:nth-child(odd)]:border-r"
              data-destaque={i === 1 || undefined}
            >
              <span className="text-4xl font-extrabold tracking-tight tabular-nums">0{i + 1}.</span>
              <h3 className="mt-auto pt-8 text-xl leading-snug font-bold">{p.titulo}</h3>
              <p className="ld-passo-texto mt-3 leading-relaxed">{p.texto}</p>
            </li>
          ))}
        </ol>
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

/** O link do buffet: as três vitrines (imagens do próprio produto, buffets de exemplo). */
export function SuaPagina() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28" aria-labelledby="titulo-pagina">
      <div
        aria-hidden
        className="ld-brilho pointer-events-none absolute top-1/2 left-1/2 size-[46rem] -translate-x-1/2 rounded-full opacity-70"
      />
      <div className="relative mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-pagina"
          titulo="Uma página com a cara do seu buffet,"
          destaque="pronta para divulgar."
          texto="Logo, fotos, pacotes, perguntas frequentes e o botão de orçamento. Você ganha um link para cada canal, o QR code para imprimir e textos prontos para a bio e o WhatsApp."
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

export function Recursos({ planos }: { planos: PlanoVitrine[] }) {
  const followUp = planoDoRecurso(planos, 'followUp');
  const blocos = [
    {
      icone: Calculator,
      titulo: 'Orçamento com as regras do seu buffet',
      texto: 'O valor sai certo sem você refazer a conta a cada pedido.',
      exemplos: [
        'Pacotes',
        'Faixas de convidados',
        'Crianças por idade',
        'Dia e turno',
        'Adicionais',
      ],
    },
    {
      icone: UserCog,
      titulo: 'Cada negociação com próximo passo',
      texto: 'Responsável, histórico, propostas e tarefas na mesma ficha.',
      exemplos: ['Responsável', 'Histórico', 'Proposta aberta', 'Tarefas', 'Funil por etapa'],
    },
    {
      icone: Repeat,
      titulo: 'Retornos preparados na hora certa',
      texto:
        'O sistema cria a tarefa e prepara a mensagem. A sua equipe revisa e envia pelo WhatsApp.',
      exemplos: [
        'Proposta sem resposta',
        'Segundo contato',
        'Proposta vencendo',
        'Cobrar o sinal',
        'Confirmar visita',
        'Depois da visita',
        'Lead quente sem contato',
      ],
      etiqueta: <EtiquetaPlano plano={followUp} texto="Tarefas automáticas" />,
    },
    {
      icone: CalendarCheck,
      titulo: 'Datas e pré-reservas organizadas',
      texto: 'Disponibilidade por espaço e turno, com prazos e intervalo entre festas.',
      exemplos: [
        'Espaços',
        'Turnos',
        'Bloqueios',
        'Prazo da pré-reserva',
        'Intervalo entre festas',
      ],
    },
    {
      icone: FileSignature,
      titulo: 'Contrato ligado à negociação',
      texto:
        'O contrato sai do orçamento aceito, com os dados da festa. O cliente confere e aceita pelo link.',
      exemplos: ['Modelo editável', 'Aceite com nome e CPF', 'Comprovante em PDF', 'Histórico'],
    },
    {
      icone: Wallet,
      titulo: 'Saiba quanto falta receber',
      texto:
        'Parcelas, recebimentos e atrasos de cada festa. Você registra o que recebeu; o Orkestra não cobra o cliente.',
      exemplos: ['Plano de pagamento', 'Recebimentos', 'Atrasos', 'Saldo por festa'],
    },
  ];
  return (
    <section
      id="recursos"
      className="relative scroll-mt-24 py-20 md:py-28"
      aria-labelledby="titulo-recursos"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-recursos"
          titulo="O que muda no dia a dia"
          destaque="do seu buffet."
        />
        <ul className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {blocos.map((b) => (
            <li
              key={b.titulo}
              className="ld-vidro ld-holofote ld-cartao flex flex-col rounded-[28px] p-6 md:p-7"
            >
              <div className="flex items-start justify-between gap-3">
                <b.icone className="text-primary-texto size-7" aria-hidden />
                {b.etiqueta}
              </div>
              <h3 className="mt-5 text-xl leading-snug font-bold">{b.titulo}</h3>
              <p className="text-muted-foreground mt-2 leading-relaxed">{b.texto}</p>
              <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Por exemplo">
                {b.exemplos.map((e) => (
                  <li
                    key={e}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-white/80"
                  >
                    {e}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Etapas com os rótulos da tela Números (domain/numeros/funil); quantidades de demonstração. */
const FUNIL_DEMO = [
  ['Visitas ao link', 420],
  ['Começaram o orçamento', 168],
  ['Deixaram o WhatsApp', 96],
  ['Viram a proposta', 81],
  ['Pediram pré-reserva ou visita', 31],
  ['Reservaram', 18],
] as const;

const ORIGEM_DEMO = [
  ['Instagram', 46],
  ['WhatsApp', 32],
  ['QR code', 12],
  ['Outros', 10],
] as const;

/** Fins de semana de exemplo: [rótulo, tarde ocupada, noite ocupada]. */
const OCUPACAO_DEMO = [
  ['Sáb 05/12', true, true],
  ['Dom 06/12', true, false],
  ['Sáb 12/12', true, false],
  ['Dom 13/12', false, false],
  ['Sáb 19/12', true, true],
  ['Dom 20/12', false, true],
] as const;

function Demonstracao() {
  return (
    <p className="text-muted-foreground mt-auto pt-5 text-xs font-semibold">
      Números de demonstração
    </p>
  );
}

export function Indicadores({ planos }: { planos: PlanoVitrine[] }) {
  const completo = planoDoRecurso(planos, 'numerosCompleto');
  const maxFunil = FUNIL_DEMO[0][1];
  return (
    <section className="relative py-20 md:py-28" aria-labelledby="titulo-indicadores">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-indicadores"
          titulo="Indicadores que ajudam"
          destaque="a decidir o próximo passo."
          texto="Veja onde os interessados param, de onde vêm as reservas e quais datas ainda estão livres para divulgar."
        />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          <article className="ld-vidro flex flex-col rounded-[28px] p-6 md:p-7">
            <BarChart3 className="text-primary-texto size-7" aria-hidden />
            <h3 className="mt-5 text-xl font-bold">Do orçamento até a reserva</h3>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              Em que etapa os interessados param, da visita ao link até a reserva.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm" aria-label="Funil de demonstração">
              {FUNIL_DEMO.map(([nome, n]) => (
                <li key={nome}>
                  <div className="flex justify-between gap-3">
                    <span>{nome}</span>
                    <span className="font-semibold tabular-nums">{n}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-white/5">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: `${Math.max(4, (n / maxFunil) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <Demonstracao />
          </article>

          <article className="ld-vidro flex flex-col rounded-[28px] p-6 md:p-7">
            <div className="flex items-start justify-between gap-3">
              <ListChecks className="text-primary-texto size-7" aria-hidden />
              <EtiquetaPlano plano={completo} />
            </div>
            <h3 className="mt-5 text-xl font-bold">De onde vêm as reservas</h3>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              A origem de cada contato (Instagram, WhatsApp, QR code) e os motivos de perda.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm" aria-label="Origem de demonstração">
              {ORIGEM_DEMO.map(([nome, pct]) => (
                <li key={nome} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3">
                  <span>{nome}</span>
                  <span className="h-2 rounded-full bg-white/5">
                    <span
                      className="block h-2 rounded-full bg-white/70"
                      style={{ width: `${pct * 2}%` }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{pct}%</span>
                </li>
              ))}
            </ul>
            <Demonstracao />
          </article>

          <article className="ld-vidro flex flex-col rounded-[28px] p-6 md:p-7">
            <div className="flex items-start justify-between gap-3">
              <CalendarCheck className="text-primary-texto size-7" aria-hidden />
              <EtiquetaPlano plano={completo} />
            </div>
            <h3 className="mt-5 text-xl font-bold">Ocupação e datas livres</h3>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              A ocupação dos próximos meses e os fins de semana com horário livre, para saber que
              datas promover.
            </p>
            <table className="mt-6 w-full text-sm" aria-label="Ocupação de demonstração">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="pb-2 text-left font-semibold">Data</th>
                  <th className="pb-2 font-semibold">Tarde</th>
                  <th className="pb-2 font-semibold">Noite</th>
                </tr>
              </thead>
              <tbody>
                {OCUPACAO_DEMO.map(([data, tarde, noite]) => (
                  <tr key={data} className="border-t border-white/5">
                    <td className="py-1.5">{data}</td>
                    {[tarde, noite].map((ocupado, i) => (
                      <td key={i} className="py-1.5 text-center">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
                            ocupado
                              ? 'bg-white/10 text-white/70'
                              : 'bg-primary text-primary-foreground',
                          )}
                        >
                          {ocupado ? 'Reservado' : 'Livre'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <Demonstracao />
          </article>
        </div>
        <p className="text-muted-foreground mt-6 text-sm">
          Os números mostram o que aconteceu no seu link e no seu atendimento. Eles ajudam a
          decidir, mas não garantem resultado.
        </p>
      </div>
    </section>
  );
}

const SEPARAR = [
  { icone: ClipboardList, texto: 'Pacotes e tabelas de preço' },
  { icone: IconeImagem, texto: 'Fotos e logo do buffet' },
  { icone: FileSignature, texto: 'Condições: sinal, parcelas e cancelamento' },
  { icone: CalendarCheck, texto: 'Festas já vendidas, para registrar na agenda' },
];

export function Implantacao({ implantacaoCentavos }: { implantacaoCentavos: number }) {
  const whats = linkWhatsappVendas('Olá! Quero saber sobre a implantação assistida do Orkestra.');
  return (
    <section
      id="implantacao"
      className="relative scroll-mt-24 py-20 md:py-28"
      aria-labelledby="titulo-implantacao"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-implantacao"
          titulo="Duas formas de colocar"
          destaque="o seu buffet no ar."
        />
        <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_1fr_1.1fr]">
          <article className="ld-vidro rounded-[28px] p-6 md:p-7">
            <h3 className="text-xl font-bold">Por conta própria</h3>
            <p className="text-muted-foreground mt-3 leading-relaxed">
              O cadastro já traz um catálogo de exemplo para o seu tipo de buffet, e um passo a
              passo guiado leva você até o link no ar: catálogo, identidade, preços, espaços e
              horários.
            </p>
            <p className="mt-4 text-sm font-semibold">Incluso no teste e nos planos.</p>
          </article>
          <article className="ld-vidro rounded-[28px] p-6 md:p-7">
            <h3 className="text-xl font-bold">Implantação assistida</h3>
            <p className="text-muted-foreground mt-3 leading-relaxed">
              Se preferir ajuda da nossa equipe para começar, a implantação assistida é opcional e
              cobrada uma única vez:{' '}
              <strong className="text-foreground">{formatBRL(implantacaoCentavos)}</strong>. O que
              entra nela é combinado com você antes da contratação.
            </p>
            {whats && (
              <a
                href={whats}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-texto mt-4 inline-flex min-h-11 items-center gap-1 font-semibold underline underline-offset-4"
              >
                Combinar pelo WhatsApp
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            )}
          </article>
          <article className="rounded-[28px] border border-white/10 p-6 md:p-7">
            <h3 className="text-xl font-bold">O que separar antes</h3>
            <ul className="mt-4 space-y-3">
              {SEPARAR.map((s) => (
                <li key={s.texto} className="flex items-start gap-3">
                  <span className="bg-primary/15 text-primary-texto grid size-8 shrink-0 place-items-center rounded-full">
                    <s.icone className="size-4" aria-hidden />
                  </span>
                  <span className="pt-1 leading-snug">{s.texto}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}

const LINK_TEXTO = 'text-primary-texto font-semibold underline underline-offset-2';

export function Perguntas({
  planos,
  planoTeste,
  diasTeste,
  implantacaoCentavos,
}: {
  planos: PlanoVitrine[];
  planoTeste: string | null;
  diasTeste: number;
  implantacaoCentavos: number;
}) {
  const espacos = planos.length
    ? planos
        .map((p) =>
          p.maxEspacos === null
            ? `no ${p.nome}, quantos espaços precisar`
            : `no ${p.nome}, ${p.maxEspacos === 1 ? '1 espaço' : `até ${p.maxEspacos} espaços`}`,
        )
        .join('; ')
    : null;
  const whatsappAvisos = planoDoRecurso(planos, 'whatsappAvisos');
  const whats = linkWhatsappVendas();
  const perguntas: { p: string; r: React.ReactNode }[] = [
    {
      p: 'Preciso de cartão para testar?',
      r: `Não. São ${diasTeste} dias grátis, sem cadastrar cartão${planoTeste ? `, com os recursos do ${planoTeste}` : ''}. No fim do teste, você escolhe se quer assinar.`,
    },
    {
      p: 'Funciona no celular?',
      r: 'Sim. O seu cliente monta o orçamento pelo celular, e você atende pelo celular ou pelo computador.',
    },
    {
      p: 'Preciso instalar alguma coisa?',
      r: 'Não. Funciona no navegador. Se quiser, adicione o Orkestra à tela inicial do celular para receber os avisos como um aplicativo.',
    },
    {
      p: 'Posso cobrar diferente por dia, turno e idade?',
      r: 'Pode. Você define ajustes por dia da semana, por turno e para feriados, faixas de convidados e quanto cada faixa de idade das crianças paga. Os adicionais podem ser por valor fixo, por unidade ou por hora.',
    },
    {
      p: 'Preciso mostrar o preço no link?',
      r: 'Não. Você escolhe entre mostrar o valor exato, mostrar um valor aproximado ou mostrar o preço só depois do contato.',
    },
    {
      p: 'O sistema envia mensagens sozinho?',
      r: `Não para o seu cliente. O Orkestra cria tarefas de retorno e prepara a mensagem; quem envia é a sua equipe, pelo WhatsApp. Os avisos automáticos vão só para você e a sua equipe: no painel, no celular${whatsappAvisos ? ` e, no ${whatsappAvisos}, no WhatsApp` : ' e no WhatsApp'}.`,
    },
    {
      p: 'Como funciona o contrato eletrônico?',
      r: 'Você gera o contrato a partir do orçamento aceito, com um modelo que pode editar. O cliente recebe um link, confere o texto e aceita informando nome completo e CPF; se você quiser, ele também confirma um código enviado por e-mail. O Orkestra guarda o texto aceito, a data e a hora e um comprovante em PDF. É uma assinatura eletrônica simples, sem certificado digital ICP-Brasil, e os modelos são sugestões: vale pedir a um advogado para revisar o seu.',
    },
    {
      p: 'Como o cliente paga o sinal?',
      r: 'Direto para você, do jeito que você já recebe (Pix, transferência, cartão). O Orkestra não processa pagamentos do seu cliente: a proposta mostra o sinal e as condições, e você registra o que recebeu para acompanhar o saldo de cada festa.',
    },
    {
      p: 'Como registro festas já fechadas?',
      r: 'Pela Agenda, criando a reserva na data e no turno, ou pelo botão + Orçamento, se quiser a proposta junto. Depois, monte o plano de pagamento da festa. Não há importação automática de planilhas.',
    },
    {
      p: 'Posso usar mais de um espaço?',
      r: espacos
        ? `Pode, conforme o plano: ${espacos}. A agenda controla cada espaço e turno separadamente.`
        : 'Pode. A agenda controla cada espaço e turno separadamente; o número de espaços depende do plano.',
    },
    {
      p: 'O que inclui a implantação assistida?',
      r: (
        <>
          É uma ajuda opcional da nossa equipe para começar, cobrada uma única vez (
          {formatBRL(implantacaoCentavos)}). O que entra nela é combinado com você antes da
          contratação
          {whats ? (
            <>
              {' '}
              pelo{' '}
              <a href={whats} target="_blank" rel="noopener noreferrer" className={LINK_TEXTO}>
                WhatsApp
              </a>
            </>
          ) : null}
          .
        </>
      ),
    },
    {
      p: 'Posso cancelar quando quiser?',
      r: 'Pode, a qualquer momento, em Minha empresa → Plano, sem falar com ninguém. O acesso continua até o fim do período já pago; depois, o painel fica só para consulta e seus dados continuam guardados.',
    },
    {
      p: 'E os dados dos meus clientes?',
      r: (
        <>
          Cada buffet só vê os próprios dados, e o suporte só entra na sua conta com a sua permissão
          e por tempo limitado. Veja a{' '}
          <Link href="/privacidade" className={LINK_TEXTO}>
            Política de Privacidade
          </Link>
          , os{' '}
          <Link href="/termos" className={LINK_TEXTO}>
            Termos de uso
          </Link>{' '}
          e a lista de{' '}
          <Link href="/subprocessadores" className={LINK_TEXTO}>
            subprocessadores
          </Link>
          .
        </>
      ),
    },
  ];
  return (
    <section
      id="duvidas"
      className="relative scroll-mt-24 py-20 md:py-28"
      aria-labelledby="titulo-duvidas"
    >
      {/* âncora antiga (links já divulgados para /#perguntas) */}
      <span id="perguntas" aria-hidden className="absolute -top-24" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <TituloSecao
            id="titulo-duvidas"
            titulo="Perguntas"
            destaque="frequentes."
            texto="Se a sua não estiver aqui, chame a gente no WhatsApp."
          />
          <BotaoWhatsappVendas className="mt-6" />
        </div>
        <div className="space-y-3" data-testid="duvidas">
          {perguntas.map((q) => (
            <details
              key={q.p}
              className="group ld-vidro rounded-3xl px-5 py-1 transition-colors open:border-[rgb(178_247_89/0.35)] sm:px-6 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="focus-visible:ring-ring/60 -mx-2 flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-2 py-3 text-base font-semibold focus-visible:ring-[3px] focus-visible:outline-none">
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
      <div className="bg-primary text-primary-foreground relative mx-auto max-w-6xl overflow-hidden rounded-[36px] px-6 py-14 text-center md:px-12 md:py-20">
        <Logotipo
          titulo=""
          className="pointer-events-none absolute -bottom-6 left-1/2 w-[140%] max-w-none -translate-x-1/2 text-black/[0.07]"
        />
        <div className="relative">
          <h2
            id="titulo-final"
            className="mx-auto max-w-3xl text-[2rem] leading-[1.06] font-extrabold tracking-[-0.035em] text-balance sm:text-5xl"
          >
            Coloque seus pacotes no link e acompanhe cada oportunidade até o fechamento.
          </h2>
          <p className="mt-5 text-lg font-medium opacity-80">
            {diasTeste} dias grátis, sem cartão. Cancele quando quiser.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <BotaoTeste className="w-full bg-[#0c0c0c] text-[#f4f4f2] hover:bg-black sm:w-auto">
              Testar {diasTeste} dias grátis
            </BotaoTeste>
            <BotaoWhatsappVendas className="min-h-13 w-full border-black/25 px-7 text-base hover:bg-black/5 sm:w-auto" />
          </div>
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
            Orçamento, atendimento e fechamento para buffets de festas. Feito no Brasil.
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

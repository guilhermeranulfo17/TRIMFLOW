import { Check, Eye, FileSignature, Flame, Info, MessageCircle, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TituloSecao } from './secoes';

/*
 * "Por dentro": três cenas do produto desenhadas em HTML/CSS, com dados fictícios e a etiqueta
 * "Exemplo ilustrativo" (não são capturas de tela). Os textos seguem o app: as linhas do
 * orçamento são as do motor com o modelo infantil (Super, 60 adultos + 10 crianças de 6 a 10
 * anos = 65 equivalentes, sábado +10%, Mesa temática, sinal de 30%), o título da tarefa e a
 * mensagem pronta são os de domain/follow-up e domain/leads/mensagens.
 */

function Janela({
  titulo,
  claro = false,
  children,
}: {
  titulo: string;
  claro?: boolean;
  children: React.ReactNode;
}) {
  return (
    <figure className="min-w-0">
      <div
        aria-hidden
        className={cn(
          'overflow-hidden rounded-[24px] border shadow-[0_40px_90px_-40px_rgb(0_0_0/0.95)]',
          claro ? 'border-white/20 bg-[#f6f7f5] text-[#161616]' : 'border-white/10 bg-[#141414]',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-1.5 border-b px-4 py-3',
            claro ? 'border-black/10' : 'border-white/10',
          )}
        >
          <span className="size-2.5 rounded-full bg-current opacity-20" />
          <span className="size-2.5 rounded-full bg-current opacity-20" />
          <span className="size-2.5 rounded-full bg-current opacity-20" />
          <span className="ml-2 truncate text-xs font-semibold opacity-60">{titulo}</span>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
      <figcaption className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
        <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 font-semibold whitespace-nowrap">
          Exemplo ilustrativo
        </span>
        Dados fictícios, desenho simplificado da tela.
      </figcaption>
    </figure>
  );
}

const LINHAS_ORCAMENTO = [
  ['Pacote Super · 65 convidados equivalentes', 'R$ 6.500,00'],
  ['Ajuste de sábado (+10%)', 'R$ 650,00'],
  ['Mesa temática', 'R$ 600,00'],
] as const;

/** Cena 1: o orçamento que o cliente vê no link (claro neutro, com a cor do buffet). */
function TelaOrcamento() {
  return (
    <Janela titulo="Link do buffet · Orçamento" claro>
      <p className="text-xs font-semibold text-[#565a52]">Aniversário infantil</p>
      <p className="mt-0.5 text-base font-bold">Sábado, 05/12 · Tarde · Salão principal</p>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
        <span className="rounded-full bg-[#0F766E]/10 px-2.5 py-1 text-[#0F766E]">60 adultos</span>
        <span className="rounded-full bg-[#0F766E]/10 px-2.5 py-1 text-[#0F766E]">
          10 crianças de 6 a 10 anos (pagam 50%)
        </span>
      </div>
      <ul className="mt-4 divide-y divide-black/10 text-sm">
        {LINHAS_ORCAMENTO.map(([a, b]) => (
          <li key={a} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0 text-[#3d3f3a]">{a}</span>
            <span className="shrink-0 font-semibold tabular-nums">{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-end justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold text-[#565a52]">Total</p>
          <p className="text-2xl font-extrabold tracking-tight tabular-nums">R$ 7.750,00</p>
        </div>
        <p className="text-right text-xs text-[#565a52]">
          Sinal de 30%
          <span className="block text-sm font-bold text-[#161616] tabular-nums">R$ 2.325,00</span>
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold">
        <span className="rounded-full bg-[#0F766E] px-3 py-2.5 text-center text-white">
          Pedir pré-reserva
        </span>
        <span className="rounded-full border border-[#0F766E]/40 px-3 py-2.5 text-center text-[#0F766E]">
          Agendar visita
        </span>
      </div>
    </Janela>
  );
}

/** Cena 2: a ficha do lead no painel, com o próximo passo. */
function TelaLead() {
  return (
    <Janela titulo="Painel · Leads · Ana">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-bold">Ana</p>
        <span className="bg-info/10 text-info border-info/30 rounded-full border px-2 py-0.5 text-xs font-semibold">
          Proposta enviada
        </span>
        <span className="bg-quente/10 text-quente border-quente/30 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold">
          <Flame className="size-3" />
          Quente
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Aniversário infantil · 05/12 · Tarde · 70 pessoas · R$ 7.750,00
      </p>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <p className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
          <UserRound className="text-muted-foreground size-4 shrink-0" />
          Responsável: Bia
        </p>
        <p className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
          <Eye className="text-muted-foreground size-4 shrink-0" />
          Proposta aberta 3 vezes
        </p>
      </div>
      <div className="border-primary/30 bg-primary/[0.06] mt-4 rounded-2xl border p-4">
        <p className="text-primary-texto text-xs font-bold tracking-wide uppercase">
          Próximo passo · hoje
        </p>
        <p className="mt-1 font-semibold">Chamar Ana: recebeu a proposta e não respondeu</p>
        <p className="mt-3 rounded-xl bg-black/30 p-3 text-sm leading-relaxed text-white/85">
          Oi, Ana! Vi que você abriu a proposta do Buffet Exemplo para o dia 05/12. Ficou alguma
          dúvida? Se quiser, já seguro a data para você.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
          <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-2">
            <MessageCircle className="size-4" />
            Abrir no WhatsApp
          </span>
          <span className="rounded-full border border-white/15 px-3 py-2">Registrar contato</span>
        </div>
      </div>
      <ol className="text-muted-foreground mt-4 space-y-1.5 border-l border-white/10 pl-4 text-xs">
        <li>Ontem, 21:40 · Abriu a proposta</li>
        <li>Seg, 10:15 · Bia enviou a proposta (versão 2)</li>
        <li>Dom, 22:03 · Montou o orçamento pelo link (Instagram)</li>
      </ol>
    </Janela>
  );
}

const PARCELAS = [
  { nome: 'Sinal', valor: 'R$ 2.325,00', quando: 'pago em 20/10', estado: 'pago' },
  { nome: 'Parcela 2 de 3', valor: 'R$ 2.712,50', quando: 'venceu em 31/10', estado: 'atrasada' },
  { nome: 'Parcela 3 de 3', valor: 'R$ 2.712,50', quando: 'vence em 28/11', estado: 'em dia' },
] as const;

/** Cena 3: reserva, contrato e recebimentos da mesma festa. */
function TelaFesta() {
  return (
    <Janela titulo="Painel · Financeiro · Festa da Ana">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-white/[0.04] p-3">
          <p className="text-muted-foreground text-xs font-semibold">Agenda</p>
          <p className="mt-1 text-sm font-bold">Sáb, 05/12 · Tarde</p>
          <span className="bg-sucesso/10 text-sucesso border-sucesso/30 mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold">
            <Check className="size-3" />
            Reservado
          </span>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-3">
          <p className="text-muted-foreground text-xs font-semibold">Contrato 2026-0042</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold">
            <FileSignature className="size-4" />
            Aceito pelo cliente
          </p>
          <p className="text-muted-foreground mt-2 text-xs">Comprovante em PDF</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['Total', 'R$ 7.750,00'],
          ['Recebido', 'R$ 2.325,00'],
          ['Falta', 'R$ 5.425,00'],
        ].map(([a, b]) => (
          <div key={a} className="rounded-2xl border border-white/10 px-2 py-3">
            <p className="text-muted-foreground text-xs">{a}</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums">{b}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {PARCELAS.map((p) => (
          <li
            key={p.nome}
            className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5"
          >
            <span className="min-w-0">
              <span className="block font-semibold">{p.nome}</span>
              <span className="text-muted-foreground text-xs">{p.quando}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-semibold tabular-nums">{p.valor}</span>
              <span
                className={cn(
                  'text-xs font-semibold',
                  p.estado === 'pago' && 'text-sucesso',
                  p.estado === 'atrasada' && 'text-erro',
                  p.estado === 'em dia' && 'text-muted-foreground',
                )}
              >
                {p.estado === 'pago' ? 'Pago' : p.estado === 'atrasada' ? 'Atrasada' : 'Em dia'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Janela>
  );
}

const CENAS = [
  {
    chave: 'orcamento',
    numero: '01',
    titulo: 'Orçamento com as suas regras',
    texto:
      'O cliente escolhe a data, os convidados e o pacote no seu link e vê o valor calculado com as regras que você cadastrou. O que ele escolheu chega junto com o contato.',
    itens: [
      'Faixas de convidados e preço por idade das crianças',
      'Ajustes por dia da semana, turno e feriado',
      'Adicionais por valor fixo, por unidade ou por hora, e deslocamento',
      'Você escolhe mostrar o valor exato, um valor aproximado ou só depois do contato',
    ],
    tela: <TelaOrcamento />,
  },
  {
    chave: 'negociacao',
    numero: '02',
    titulo: 'Negociação com próximo passo',
    texto:
      'Cada interessado tem uma ficha com responsável, histórico, propostas e tarefas. Você vê quando a proposta foi aberta e o que fazer em seguida.',
    itens: [
      'Proposta na web e em PDF, com validade e versões anteriores',
      'Tarefas de retorno e mensagens prontas para a equipe revisar e enviar',
      'Lista por prioridade ou funil por etapa',
    ],
    tela: <TelaLead />,
  },
  {
    chave: 'fechamento',
    numero: '03',
    titulo: 'Reserva, contrato e recebimentos',
    texto:
      'Quando o cliente decide, a data vai para a agenda, o contrato sai do orçamento aceito e os pagamentos da festa ficam anotados no mesmo lugar.',
    itens: [
      'Pré-reserva com prazo, por espaço e turno, sem marcar duas festas no mesmo horário',
      'Contrato com aceite eletrônico do cliente e histórico',
      'Parcelas, valores recebidos e atrasos de cada festa',
    ],
    tela: <TelaFesta />,
  },
];

export function ProdutoPorDentro() {
  return (
    <section
      id="produto"
      className="relative scroll-mt-24 py-20 md:py-28"
      aria-labelledby="titulo-produto"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-produto"
          sobre="Por dentro do Orkestra"
          titulo="Do pedido de orçamento"
          destaque="à festa fechada."
          texto="Três momentos do atendimento, do jeito que aparecem no sistema."
        />
        <div className="mt-14 space-y-20 md:space-y-28">
          {CENAS.map((c, i) => (
            <article
              key={c.chave}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
              aria-labelledby={`cena-${c.chave}`}
            >
              <div className={cn('min-w-0', i % 2 === 1 && 'lg:order-2')}>
                <p className="text-primary-texto text-sm font-extrabold tabular-nums">{c.numero}</p>
                <h3
                  id={`cena-${c.chave}`}
                  className="mt-2 text-3xl leading-tight font-extrabold tracking-[-0.02em] text-balance"
                >
                  {c.titulo}
                </h3>
                <p className="text-muted-foreground mt-4 text-lg leading-relaxed">{c.texto}</p>
                <ul className="mt-6 space-y-3">
                  {c.itens.map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="bg-primary/15 text-primary-texto mt-0.5 grid size-6 shrink-0 place-items-center rounded-full">
                        <Check className="size-4" aria-hidden />
                      </span>
                      <span className="leading-relaxed">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={cn('min-w-0', i % 2 === 1 && 'lg:order-1')}>{c.tela}</div>
            </article>
          ))}
        </div>
        <p className="text-muted-foreground mt-16 flex items-center gap-2 text-sm">
          <Info className="size-4 shrink-0" aria-hidden />
          Nenhuma mensagem sai sozinha para o seu cliente: o sistema prepara, a sua equipe envia.
        </p>
      </div>
    </section>
  );
}

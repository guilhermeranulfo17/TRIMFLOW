import { CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import { classeDaFonte } from '@/components/publico/fontes';
import type { LinhaInvestimento, ModeloProposta, ModeloVisual } from '@/domain/proposta';

/*
 * Desenho web da proposta. Só desenha o ModeloProposta (domain/proposta/conteudo): o PDF desenha
 * o mesmo modelo, na mesma ordem de seções, e no mesmo modelo visual (m.visual). Os títulos usam
 * a fonte do estilo da página pública: elegante = serifada (Cormorant), alegre = a do "festivo".
 */

/** Estilo da página pública que dá a tipografia de cada modelo visual da proposta. */
const ESTILO_DO_VISUAL = { elegante: 'elegante', alegre: 'festivo' } as const;

function Secao({
  titulo,
  children,
  id,
  visual,
}: {
  titulo: string;
  children: React.ReactNode;
  id?: string;
  visual: ModeloVisual;
}) {
  return (
    <section className={visual === 'elegante' ? 'mt-10' : 'mt-6'} aria-labelledby={id}>
      <h2
        id={id}
        className={
          visual === 'elegante'
            ? 'font-titulo border-b border-[var(--marca-destaque)]/40 pb-1 text-2xl font-medium text-[var(--marca-destaque)]'
            : 'font-titulo bg-primary text-primary-foreground inline-block rounded-full px-3 py-1 text-sm font-bold tracking-wide uppercase'
        }
      >
        {titulo}
      </h2>
      <div className={visual === 'elegante' ? 'mt-3' : 'mt-2'}>{children}</div>
    </section>
  );
}

/** Linha do investimento; o pacote vem com a foto congelada e a descrição. */
function Linha({ l }: { l: LinhaInvestimento }) {
  return (
    <li className="p-4">
      <div className={l.foto ? 'flex flex-col gap-3 sm:flex-row sm:items-start' : ''}>
        {l.foto && (
          // eslint-disable-next-line @next/next/no-img-element -- foto já no tamanho certo (§18)
          <img
            src={l.foto}
            alt={l.descricao}
            width={640}
            height={427}
            loading="lazy"
            decoding="async"
            className="aspect-[3/2] w-full shrink-0 rounded-[var(--radius-foto)] object-cover sm:w-44"
            data-testid="foto-item"
          />
        )}
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-semibold">{l.descricao}</span>
            {l.texto && (
              <span className="text-muted-foreground mt-0.5 block text-sm">{l.texto}</span>
            )}
            {l.detalhe && <span className="text-muted-foreground block text-sm">{l.detalhe}</span>}
          </span>
          <span
            className={`shrink-0 font-semibold tabular-nums ${l.negativo ? 'text-emerald-700' : ''}`}
          >
            {l.valor}
          </span>
        </div>
      </div>
    </li>
  );
}

/** Capa do modelo elegante: branca, centrada, título serifado e fios na cor da marca. */
function CapaElegante({ m }: { m: ModeloProposta }) {
  return (
    <header
      className="relative -mx-4 border-b border-[var(--marca-destaque)]/30 px-5 pt-8 pb-7 text-center sm:mx-0 sm:px-8 sm:pt-12"
      data-testid="capa-proposta"
    >
      {m.cabecalho.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.cabecalho.logoUrl}
          alt=""
          className="mx-auto mb-5 size-20 object-contain sm:size-24"
        />
      )}
      <p className="font-titulo text-2xl font-bold tracking-wide sm:text-3xl">
        {m.cabecalho.buffet}
      </p>
      <div className="mx-auto my-5 h-px w-16 bg-[var(--marca-destaque)]" aria-hidden />
      {m.evento.cliente && (
        <>
          <p className="font-titulo text-muted-foreground text-lg font-medium italic">
            Proposta para
          </p>
          <p className="font-titulo text-4xl font-medium text-[var(--marca-destaque)] sm:text-5xl">
            {m.evento.cliente}
          </p>
        </>
      )}
      <p className="text-muted-foreground mt-4 text-xs tracking-[0.18em] uppercase">
        {[m.evento.tipo, m.evento.data].filter(Boolean).join(' · ')}
      </p>
      <h1 className="text-muted-foreground mt-6 text-sm" data-testid="titulo-proposta">
        {m.cabecalho.titulo}
        {m.cabecalho.emitidaEm ? ` · emitida em ${m.cabecalho.emitidaEm}` : ''}
      </h1>
      <div className="mx-auto mt-6 max-w-sm border-y border-[var(--marca-destaque)]/50 py-4">
        <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
          Investimento total
        </p>
        <p className="font-titulo text-4xl font-semibold text-[var(--marca-destaque)] tabular-nums">
          {m.investimento.total}
        </p>
        {m.investimento.porConvidado && (
          <p className="text-muted-foreground text-sm">
            {m.investimento.porConvidado} por convidado
          </p>
        )}
      </div>
      <p
        className="mt-4 text-sm font-semibold text-[var(--marca-destaque)]"
        data-testid="validade-proposta"
      >
        {m.cabecalho.validade}
      </p>
    </header>
  );
}

/** Capa do modelo alegre: degradê na cor da marca, logo redondo e total em destaque. */
function CapaAlegre({ m }: { m: ModeloProposta }) {
  return (
    <header
      className="sm:rounded-card relative -mx-4 overflow-hidden px-5 pt-6 pb-5 sm:mx-0 sm:px-7 sm:pt-8"
      style={{
        background: `linear-gradient(135deg, ${m.cores.destaque} 0%, ${m.cores.base} 100%)`,
        color: '#FFFFFF',
      }}
      data-testid="capa-proposta"
    >
      <svg
        aria-hidden
        className="formas-festivas absolute -top-10 -right-10 size-48 opacity-20"
        viewBox="0 0 200 200"
      >
        <circle cx="70" cy="70" r="60" fill="white" />
        <circle cx="160" cy="150" r="30" fill="white" />
      </svg>
      <div className="relative flex items-center gap-3">
        {m.cabecalho.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.cabecalho.logoUrl}
            alt=""
            className="size-14 shrink-0 rounded-full border-2 border-white bg-white object-cover sm:size-16"
          />
        )}
        <div className="min-w-0">
          <p className="font-titulo truncate text-lg font-bold">{m.cabecalho.buffet}</p>
          <p className="text-sm text-white/90">
            {m.cabecalho.emitidaEm ? `Emitida em ${m.cabecalho.emitidaEm}` : 'Proposta'}
          </p>
        </div>
      </div>
      <h1
        className="font-titulo relative mt-5 text-2xl font-bold tracking-tight sm:text-3xl"
        data-testid="titulo-proposta"
      >
        {m.cabecalho.titulo}
      </h1>
      <ul className="relative mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/95">
        {m.cardapio && <li>Pacote {m.cardapio.pacote}</li>}
        <li className="first-letter:uppercase">{m.evento.data}</li>
        <li>{m.evento.totalConvidados} convidados</li>
      </ul>
      <div className="relative mt-5 flex flex-wrap items-end justify-between gap-3 rounded-[calc(var(--radius-card)-4px)] bg-white p-4 text-[var(--marca-destaque)] shadow-sm">
        <div>
          <p className="text-xs font-bold tracking-wide uppercase">Total</p>
          <p className="font-titulo text-3xl font-bold tabular-nums sm:text-4xl">
            {m.investimento.total}
          </p>
          {m.investimento.porConvidado && (
            <p className="text-sm">{m.investimento.porConvidado} por convidado</p>
          )}
        </div>
        <p
          className="rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-semibold"
          data-testid="validade-proposta"
        >
          {m.cabecalho.validade}
        </p>
      </div>
    </header>
  );
}

export function PropostaWeb({ modelo: m }: { modelo: ModeloProposta }) {
  const v = m.visual;
  const estilo = ESTILO_DO_VISUAL[v];
  return (
    <article
      data-testid="proposta"
      data-estilo={estilo}
      data-visual={v}
      className={classeDaFonte(estilo)}
    >
      {v === 'elegante' ? <CapaElegante m={m} /> : <CapaAlegre m={m} />}

      {m.abertura && (
        <p
          className={
            v === 'elegante'
              ? 'font-titulo mt-8 text-xl leading-relaxed font-medium italic'
              : 'mt-5 text-base leading-relaxed'
          }
        >
          {m.abertura}
        </p>
      )}

      <Secao visual={v} titulo="Evento" id="sec-evento">
        <div className={v === 'elegante' ? 'py-1' : 'rounded-card bg-accent p-4'}>
          {m.evento.cliente && <p className="font-bold">{m.evento.cliente}</p>}
          {m.evento.tipo && <p className="text-muted-foreground">{m.evento.tipo}</p>}
          <ul className="text-muted-foreground mt-2 grid gap-1.5 text-sm">
            <li className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              <span className="first-letter:uppercase">{m.evento.data}</span>
            </li>
            {m.evento.horario && (
              <li className="flex items-center gap-2">
                <Clock className="size-4 shrink-0" aria-hidden />
                {m.evento.horario}
              </li>
            )}
            {m.evento.espaco && (
              <li className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0" aria-hidden />
                {m.evento.espaco}
              </li>
            )}
            <li className="flex items-start gap-2">
              <Users className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {m.evento.convidados
                  .map((c) => `${c.quantidade} ${c.rotulo.toLowerCase()}`)
                  .join(' · ')}
              </span>
            </li>
          </ul>
          {m.evento.avisoDeslocamento && (
            <p className="text-muted-foreground mt-2 text-sm">{m.evento.avisoDeslocamento}</p>
          )}
        </div>
      </Secao>

      <Secao visual={v} titulo="Investimento" id="sec-investimento">
        <div className={v === 'elegante' ? '' : 'rounded-card border'}>
          <ul className="divide-y" data-testid="linhas-proposta">
            {m.investimento.linhas.map((l, i) => (
              <Linha key={i} l={l} />
            ))}
          </ul>
          <div
            className={
              v === 'elegante'
                ? 'flex items-baseline justify-between gap-3 border-y border-[var(--marca-destaque)]/60 py-4'
                : 'bg-primary text-primary-foreground rounded-b-card flex items-baseline justify-between gap-3 p-4'
            }
          >
            <span
              className={
                v === 'elegante'
                  ? 'text-muted-foreground text-xs tracking-[0.18em] uppercase'
                  : 'font-bold'
              }
            >
              {v === 'elegante' ? 'Investimento total' : 'Total'}
            </span>
            <span
              className={
                v === 'elegante'
                  ? 'font-titulo text-3xl font-semibold text-[var(--marca-destaque)] tabular-nums'
                  : 'text-2xl font-extrabold tabular-nums'
              }
              data-testid="total-proposta"
            >
              {m.investimento.total}
            </span>
          </div>
        </div>
        {m.investimento.porConvidado && (
          <p className="text-muted-foreground mt-2 text-right text-sm">
            {m.investimento.porConvidado} por convidado
          </p>
        )}
      </Secao>

      <Secao visual={v} titulo="Condições" id="sec-condicoes">
        <ul className="text-muted-foreground grid gap-1.5 text-sm">
          {m.condicoes.sinal && <li>Sinal de {m.condicoes.sinal}.</li>}
          {m.condicoes.parcelas.map((p) => (
            <li key={p}>{p}</li>
          ))}
          {m.condicoes.formasPagamento && (
            <li>Formas de pagamento: {m.condicoes.formasPagamento}.</li>
          )}
          {m.condicoes.ultimaParcela && <li>{m.condicoes.ultimaParcela}.</li>}
        </ul>
        {m.condicoes.texto && (
          <p className="text-muted-foreground mt-2 text-sm whitespace-pre-line">
            {m.condicoes.texto}
          </p>
        )}
      </Secao>

      {m.cardapio && (
        <Secao visual={v} titulo={`Cardápio · ${m.cardapio.pacote}`} id="sec-cardapio">
          <div className="grid gap-2 text-sm">
            {m.cardapio.secoes.map((s) => (
              <div key={s.nome}>
                <p className="font-semibold">{s.nome}</p>
                <p className="text-muted-foreground">{s.itens.join(', ')}</p>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {m.incluso && (m.incluso.duracao || m.incluso.naoIncluso) && (
        <Secao visual={v} titulo="Incluso e não incluso" id="sec-incluso">
          <ul className="text-muted-foreground grid gap-1.5 text-sm">
            {m.incluso.duracao && <li>Incluso: {m.incluso.duracao}.</li>}
            {m.incluso.naoIncluso && <li>Não incluso: {m.incluso.naoIncluso}</li>}
          </ul>
        </Secao>
      )}

      {m.politicas && (m.politicas.cancelamento || m.politicas.alteracaoConvidados) && (
        <Secao visual={v} titulo="Políticas" id="sec-politicas">
          <ul className="text-muted-foreground grid gap-1.5 text-sm">
            {m.politicas.cancelamento && <li>Cancelamento: {m.politicas.cancelamento}</li>}
            {m.politicas.alteracaoConvidados && (
              <li>Alteração de convidados: {m.politicas.alteracaoConvidados}</li>
            )}
          </ul>
        </Secao>
      )}

      {m.observacoes && (
        <Secao visual={v} titulo="Observações" id="sec-observacoes">
          <p className="text-sm whitespace-pre-line">{m.observacoes}</p>
        </Secao>
      )}
    </article>
  );
}

/** Rodapé da proposta (identidade do buffet + "feito com Orkestra"). */
export function RodapeProposta({ modelo: m }: { modelo: ModeloProposta }) {
  return (
    <footer className="text-muted-foreground mt-10 border-t pt-4 pb-8 text-center text-xs">
      <p>{m.rodape.linhas.join(' · ')}</p>
      {m.rodape.orkestra && (
        <p className="mt-2 flex items-center justify-center gap-1.5">
          Feito com
          <span className="rounded-full bg-[#161616] px-2 py-0.5 font-bold text-[#B2F759]">
            Orkestra
          </span>
        </p>
      )}
    </footer>
  );
}

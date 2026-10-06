import { CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import type { ModeloProposta } from '@/domain/proposta';

/*
 * Desenho web da proposta. Só desenha o ModeloProposta (domain/proposta/conteudo): o PDF desenha
 * o mesmo modelo, na mesma ordem de seções.
 */

function Secao({
  titulo,
  children,
  id,
}: {
  titulo: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className="mt-6" aria-labelledby={id}>
      <h2
        id={id}
        className="font-titulo text-sm font-bold tracking-wide text-[var(--marca-destaque)] uppercase"
      >
        {titulo}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function PropostaWeb({ modelo: m }: { modelo: ModeloProposta }) {
  return (
    <article data-testid="proposta">
      {/* Capa: identidade do buffet (cor, fonte do estilo, logo), resumo e total em destaque */}
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

      {m.abertura && <p className="mt-5 text-base leading-relaxed">{m.abertura}</p>}

      <Secao titulo="Evento" id="sec-evento">
        <div className="rounded-card border p-4">
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

      <Secao titulo="Investimento" id="sec-investimento">
        <div className="rounded-card border">
          <ul className="divide-y" data-testid="linhas-proposta">
            {m.investimento.linhas.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-3 p-4">
                <span className="min-w-0">
                  <span className="block font-semibold">{l.descricao}</span>
                  {l.detalhe && (
                    <span className="text-muted-foreground block text-sm">{l.detalhe}</span>
                  )}
                </span>
                <span
                  className={`shrink-0 font-semibold tabular-nums ${l.negativo ? 'text-emerald-700' : ''}`}
                >
                  {l.valor}
                </span>
              </li>
            ))}
          </ul>
          <div className="bg-accent rounded-b-card flex items-baseline justify-between gap-3 p-4">
            <span className="font-bold">Total</span>
            <span className="text-2xl font-extrabold tabular-nums" data-testid="total-proposta">
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

      <Secao titulo="Condições" id="sec-condicoes">
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
        <Secao titulo={`Cardápio · ${m.cardapio.pacote}`} id="sec-cardapio">
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
        <Secao titulo="Incluso e não incluso" id="sec-incluso">
          <ul className="text-muted-foreground grid gap-1.5 text-sm">
            {m.incluso.duracao && <li>Incluso: {m.incluso.duracao}.</li>}
            {m.incluso.naoIncluso && <li>Não incluso: {m.incluso.naoIncluso}</li>}
          </ul>
        </Secao>
      )}

      {m.politicas && (m.politicas.cancelamento || m.politicas.alteracaoConvidados) && (
        <Secao titulo="Políticas" id="sec-politicas">
          <ul className="text-muted-foreground grid gap-1.5 text-sm">
            {m.politicas.cancelamento && <li>Cancelamento: {m.politicas.cancelamento}</li>}
            {m.politicas.alteracaoConvidados && (
              <li>Alteração de convidados: {m.politicas.alteracaoConvidados}</li>
            )}
          </ul>
        </Secao>
      )}

      {m.observacoes && (
        <Secao titulo="Observações" id="sec-observacoes">
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

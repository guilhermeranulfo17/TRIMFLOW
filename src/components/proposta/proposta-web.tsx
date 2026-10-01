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
        className="text-sm font-extrabold tracking-wide text-[var(--marca-destaque)] uppercase"
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
      <header
        className="sm:rounded-card -mx-4 flex items-center gap-3 px-4 py-5 sm:mx-0"
        style={{ background: m.cores.base, color: m.cores.texto }}
      >
        {m.cabecalho.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.cabecalho.logoUrl}
            alt=""
            className="size-14 shrink-0 rounded-full bg-white object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold opacity-90">{m.cabecalho.buffet}</p>
          <h1 className="text-xl font-extrabold tracking-tight" data-testid="titulo-proposta">
            {m.cabecalho.titulo}
          </h1>
          <p className="text-sm opacity-90">
            {m.cabecalho.emitidaEm ? `Emitida em ${m.cabecalho.emitidaEm} · ` : ''}
            <span className="font-semibold" data-testid="validade-proposta">
              {m.cabecalho.validade}
            </span>
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
        <p className="mt-2">
          feito com <span className="text-foreground font-bold">Orkestra</span>
        </p>
      )}
    </footer>
  );
}

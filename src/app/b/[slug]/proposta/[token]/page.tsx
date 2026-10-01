import { CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { diaDaSemana, formatData } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { formatBp } from '@/domain/percent';
import { BannerTeste } from '@/components/publico/banner-teste';
import { RodapePublico } from '@/components/publico/rodape';
import { lerProposta } from '@/server/publico/carregar';
import { ehModoTeste } from '@/server/publico/sessao';
import { exigirBuffet } from '../../buscar';
import { AcoesProposta } from './acoes';

type Props = { params: Promise<{ slug: string; token: string }> };

export const metadata: Metadata = {
  title: 'Sua proposta',
  robots: { index: false, follow: false },
};

/** Proposta congelada (o preço não muda depois de concluída). */
export default async function PaginaProposta({ params }: Props) {
  const { slug, token } = await params;
  const buffet = await exigirBuffet(slug);
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) notFound();
  const [proposta, modoTeste] = await Promise.all([lerProposta(slug, token), ehModoTeste(slug)]);
  if (!proposta) notFound();

  const r = proposta.resultado;
  const expirada = proposta.status === 'expirado';
  const substituida = proposta.status === 'substituido';

  return (
    <>
      {(modoTeste || proposta.ehTeste) && <BannerTeste />}
      <main className="mx-auto max-w-2xl px-4 pt-6 pb-10">
        <header className="flex items-center gap-3">
          {buffet.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={buffet.logoUrl} alt="" className="size-12 rounded-full border object-cover" />
          )}
          <div>
            <p className="text-muted-foreground text-sm font-semibold">{buffet.nome}</p>
            <h1 className="text-2xl font-extrabold tracking-tight" data-testid="titulo-proposta">
              {expirada ? 'Proposta expirada' : `Proposta nº ${proposta.numero}`}
            </h1>
          </div>
        </header>

        {proposta.clientePrimeiroNome && !expirada && (
          <p className="mt-4 text-base">
            {proposta.clientePrimeiroNome}, aqui está o orçamento da sua festa.
          </p>
        )}

        <section className="rounded-card mt-5 border p-4" aria-label="Sua festa">
          <h2 className="font-bold">{proposta.tipoEvento ?? 'Sua festa'}</h2>
          <ul className="text-muted-foreground mt-2 grid gap-1.5 text-sm">
            <li className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              {diaDaSemana(proposta.data)}, {formatData(proposta.data)}
            </li>
            {proposta.turno && (
              <li className="flex items-center gap-2">
                <Clock className="size-4 shrink-0" aria-hidden />
                {proposta.turno.nome} · começa às {proposta.turno.horaInicio}
              </li>
            )}
            {proposta.espaco && (
              <li className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0" aria-hidden />
                {proposta.espaco}
              </li>
            )}
            <li className="flex items-center gap-2">
              <Users className="size-4 shrink-0" aria-hidden />
              {proposta.convidados} convidados
            </li>
          </ul>
        </section>

        <section className="rounded-card mt-4 border" aria-label="Valores">
          <ul className="divide-y" data-testid="linhas-proposta">
            {proposta.itens.map((i, n) => (
              <li key={n} className="flex items-start justify-between gap-3 p-4">
                <span className="min-w-0">
                  <span className="block font-semibold">{i.descricao}</span>
                  {i.detalhe && (
                    <span className="text-muted-foreground block text-sm">{i.detalhe}</span>
                  )}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatBRL(i.subtotalCentavos)}
                </span>
              </li>
            ))}
          </ul>
          <div className="bg-accent rounded-b-card flex items-baseline justify-between gap-3 p-4">
            <span className="font-bold">Total</span>
            <span className="text-2xl font-extrabold tabular-nums" data-testid="total-proposta">
              {formatBRL(proposta.totalCentavos)}
            </span>
          </div>
        </section>

        <section className="mt-4 text-sm" aria-label="Condições">
          <h2 className="font-bold">Condições</h2>
          <ul className="text-muted-foreground mt-2 grid gap-1.5">
            {r.porConvidadoCentavos > 0 && (
              <li>{formatBRL(r.porConvidadoCentavos)} por convidado.</li>
            )}
            {r.sinalCentavos > 0 && (
              <li>
                Sinal de {formatBRL(r.sinalCentavos)} ({formatBp(proposta.regras.sinalBp)}) para
                confirmar a data
                {r.parcelas.length > 0
                  ? `; o restante em ${r.parcelas.length}× (${r.parcelas
                      .map((p) => `${formatBRL(p.valorCentavos)} até ${formatData(p.vencimento)}`)
                      .join(', ')}).`
                  : '.'}
              </li>
            )}
            <li>
              A pré-reserva segura a data por {proposta.regras.prazoPreReservaHoras} horas, até o
              pagamento do sinal.
            </li>
            {proposta.regras.cancelamentoTexto && <li>{proposta.regras.cancelamentoTexto}</li>}
            <li className={expirada ? 'text-destructive font-semibold' : 'font-semibold'}>
              {expirada
                ? `Esta proposta venceu em ${formatData(proposta.validadeAte)}.`
                : `Proposta válida até ${formatData(proposta.validadeAte)}.`}
            </li>
          </ul>
        </section>

        <AcoesProposta
          slug={slug}
          token={token}
          buffet={{ nome: buffet.nome, whatsappE164: buffet.whatsappE164 }}
          estado={
            substituida
              ? 'substituida'
              : expirada
                ? 'expirada'
                : proposta.reserva
                  ? 'reservada'
                  : proposta.suspenso
                    ? 'suspensa'
                    : 'aberta'
          }
          expiraEm={proposta.reserva?.expiraEm ?? null}
          hoje={proposta.hoje}
          resumo={{
            numero: proposta.numero,
            tipoEvento: proposta.tipoEvento,
            data: proposta.data,
            turno: proposta.turno?.nome ?? null,
            convidados: proposta.convidados,
            totalCentavos: proposta.totalCentavos,
          }}
          sinalCentavos={r.sinalCentavos}
          turno={proposta.turno}
        />
      </main>
      <RodapePublico />
    </>
  );
}

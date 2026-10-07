import { ArrowLeft, FileX2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Estornar } from '@/components/app/financeiro/estornar';
import { PlanoPagamento } from '@/components/app/financeiro/plano-pagamento';
import { RegistrarPagamento } from '@/components/app/financeiro/registrar-pagamento';
import { SeloFinanceiro } from '@/components/app/financeiro/selo-financeiro';
import { EmptyState } from '@/components/app/empty-state';
import { PendenteLink } from '@/components/app/pendente-link';
import { podeEscrever } from '@/domain/cobranca/situacao';
import { formatData } from '@/domain/dates';
import { ROTULO_FORMA, type StatusParcela } from '@/domain/financeiro';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import { exigirPerfil } from '@/server/auth/guards';
import { carregarFinanceiroDaFesta } from '@/server/financeiro/carregar';

export const metadata: Metadata = { title: 'Pagamentos da festa' };

type Props = { params: Promise<{ reservaId: string }> };

const ROTULO_PARCELA: Record<StatusParcela, string> = {
  paga: 'Paga',
  parcial: 'Parte paga',
  vencida: 'Atrasada',
  aberta: 'Em aberto',
};
const CLASSE_PARCELA: Record<StatusParcela, string> = {
  paga: 'text-sucesso',
  parcial: 'text-info',
  vencida: 'text-erro font-semibold',
  aberta: 'text-muted-foreground',
};

/** Pagamentos de uma festa: plano, situação de cada parcela, registrar e estornar. */
export default async function FinanceiroFestaPage({ params }: Props) {
  const { reservaId } = await params;
  const dono = await exigirPerfil('dono');
  const f = await carregarFinanceiroDaFesta(dono, reservaId);
  const voltar = (
    <Link
      href="/app/financeiro"
      className="text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Financeiro
      <PendenteLink />
    </Link>
  );
  if (!f) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {voltar}
        <EmptyState icone={FileX2} titulo="Festa não encontrada">
          Só reservas confirmadas têm pagamentos. Confirme a pré-reserva na Agenda.
        </EmptyState>
      </div>
    );
  }
  const s = f.situacao;
  const escrever = !dono.empresa.demo && podeEscrever(dono.empresa.situacao);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {voltar}
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight break-words">{f.cliente}</h1>
          <SeloFinanceiro status={s.status} />
        </div>
        <p className="text-muted-foreground">
          Festa {formatData(f.data)}
          {f.tipoEvento && ` · ${f.tipoEvento}`}
          {f.convidados ? ` · ${f.convidados} convidados` : ''}
          {f.leadId && (
            <>
              {' · '}
              <Link
                href={`/app/leads/${f.leadId}`}
                className="text-primary-texto font-semibold underline-offset-2 hover:underline"
              >
                Abrir o lead
              </Link>
            </>
          )}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="resumo-festa">
        {(
          [
            ['Total', s.totalCentavos, ''],
            ['Recebido', s.recebidoCentavos, 'text-sucesso'],
            ['Falta', s.saldoCentavos, ''],
            ['Atrasado', s.atrasadoCentavos, s.atrasadoCentavos > 0 ? 'text-erro' : ''],
          ] as const
        ).map(([k, v, cor]) => (
          <div key={k} className="bg-card rounded-card border p-3">
            <dt className="text-muted-foreground text-sm">{k}</dt>
            <dd className={cn('text-lg font-bold tabular-nums', cor)}>{formatBRL(v)}</dd>
          </div>
        ))}
      </dl>
      {s.sobraCentavos > 0 && (
        <p
          className="bg-alerta/10 text-alerta border-alerta/30 rounded-card border p-3 text-sm"
          role="status"
        >
          Recebido {formatBRL(s.sobraCentavos)} a mais que o total. Confira se algum pagamento foi
          lançado em dobro (dá para estornar).
        </p>
      )}

      {f.temPlano && (
        <section className="bg-card rounded-card border p-4" aria-labelledby="titulo-plano">
          <h2 id="titulo-plano" className="mb-2 font-bold">
            Plano de pagamento
          </h2>
          <ul className="divide-y" data-testid="parcelas">
            {s.parcelas.map((p, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  <span className="block font-semibold">{p.descricao}</span>
                  <span className="text-muted-foreground">vence {formatData(p.venceEm)}</span>
                </span>
                <span className="text-right tabular-nums">
                  <span className="block font-semibold">{formatBRL(p.valorCentavos)}</span>
                  <span className={CLASSE_PARCELA[p.status]} data-status-parcela={p.status}>
                    {ROTULO_PARCELA[p.status]}
                    {p.status === 'parcial' || (p.status === 'vencida' && p.pagoCentavos > 0)
                      ? `: falta ${formatBRL(p.faltaCentavos)}`
                      : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {escrever && (
        <PlanoPagamento
          key={JSON.stringify(f.plano)}
          reservaId={f.reservaId}
          inicial={f.plano}
          salvo={f.temPlano}
          hoje={f.hoje}
        />
      )}

      {escrever && (
        <RegistrarPagamento
          // nova sugestão (plano salvo, pagamento lançado): o formulário recomeça com ela
          key={`${s.proxima?.faltaCentavos ?? ''}-${s.saldoCentavos}`}
          reservaId={f.reservaId}
          hoje={f.hoje}
          sugestaoCentavos={s.proxima?.faltaCentavos ?? (s.saldoCentavos || null)}
        />
      )}

      <section className="bg-card rounded-card border p-4" aria-labelledby="titulo-recebidos">
        <h2 id="titulo-recebidos" className="mb-2 font-bold">
          Pagamentos recebidos
        </h2>
        {f.sinalDaAgenda ? (
          <p className="text-sm" data-testid="sinal-da-agenda">
            Sinal de {formatBRL(f.sinalDaAgenda.centavos)} marcado como pago na Agenda em{' '}
            {formatData(f.sinalDaAgenda.pagoEm)}. Ele entra aqui quando você salvar o plano.
          </p>
        ) : f.recebimentos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum pagamento registrado ainda.</p>
        ) : (
          <ul className="divide-y" data-testid="recebimentos">
            {f.recebimentos.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                data-estornado={r.estornadoEm ? 'sim' : undefined}
              >
                <span
                  className={cn('min-w-0', r.estornadoEm && 'text-muted-foreground line-through')}
                >
                  <span className="block font-semibold tabular-nums">
                    {formatBRL(r.valorCentavos)} · {ROTULO_FORMA[r.forma]}
                  </span>
                  <span className="text-muted-foreground block">
                    {formatData(r.recebidoEm)}
                    {r.quem && ` · lançado por ${r.quem}`}
                    {r.observacao && ` · ${r.observacao}`}
                  </span>
                </span>
                {r.estornadoEm ? (
                  <span className="text-muted-foreground text-xs">
                    Estornado em {formatData(r.estornadoEm)}
                    {r.estornoMotivo && `: ${r.estornoMotivo}`}
                  </span>
                ) : (
                  escrever && (
                    <Estornar
                      id={r.id}
                      reservaId={f.reservaId}
                      descricao={`o pagamento de ${formatBRL(r.valorCentavos)}`}
                    />
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

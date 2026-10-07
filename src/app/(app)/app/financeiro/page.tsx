import { Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SeloFinanceiro } from '@/components/app/financeiro/selo-financeiro';
import { EmptyState } from '@/components/app/empty-state';
import { PendenteLink } from '@/components/app/pendente-link';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { formatData } from '@/domain/dates';
import {
  FILTROS_FINANCEIRO,
  ROTULO_FILTRO_FINANCEIRO,
  filtroFinanceiroDaUrl,
} from '@/domain/financeiro';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import { exigirPerfil } from '@/server/auth/guards';
import { carregarFinanceiro } from '@/server/financeiro/carregar';

export const metadata: Metadata = { title: 'Financeiro' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Financeiro (só o dono): o que entrou no mês, o que vence em 30 dias, o atrasado e cada festa. */
export default async function FinanceiroPage({ searchParams }: Props) {
  const dono = await exigirPerfil('dono');
  const filtro = filtroFinanceiroDaUrl((await searchParams).status);
  const t = await carregarFinanceiro(dono, filtro);
  const cartoes: [string, number, string, string][] = [
    ['Recebido no mês', t.resumo.recebidoNoMesCentavos, 'text-sucesso', 'cartao-recebido'],
    ['Vence em 30 dias', t.resumo.aReceber30DiasCentavos, '', 'cartao-a-receber'],
    [
      'Atrasado',
      t.resumo.atrasadoCentavos,
      t.resumo.atrasadoCentavos > 0 ? 'text-erro' : '',
      'cartao-atrasado',
    ],
    ['Saldo das festas', t.resumo.saldoTotalCentavos, '', 'cartao-saldo'],
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <TituloPagina>Financeiro</TituloPagina>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="resumo-financeiro">
        {cartoes.map(([rotulo, valor, cor, id]) => (
          <div key={id} className="bg-card rounded-card border p-4" data-testid={id}>
            <dt className="text-muted-foreground text-sm">{rotulo}</dt>
            <dd className={cn('mt-1 text-xl font-bold tabular-nums sm:text-2xl', cor)}>
              {formatBRL(valor)}
            </dd>
          </div>
        ))}
      </dl>

      <nav aria-label="Filtrar festas" data-testid="filtros-financeiro">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {FILTROS_FINANCEIRO.map((f) => {
            const ativo = f === filtro;
            return (
              <li key={f} className="shrink-0">
                <Link
                  href={f === 'abertos' ? '/app/financeiro' : `/app/financeiro?status=${f}`}
                  aria-current={ativo ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors',
                    ativo ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent',
                  )}
                  data-testid={`filtro-financeiro-${f}`}
                >
                  {ROTULO_FILTRO_FINANCEIRO[f]}
                  <span className={cn('text-xs', !ativo && 'text-muted-foreground')}>
                    {t.contagem[f]}
                  </span>
                  <PendenteLink />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {t.festas.length === 0 ? (
        <EmptyState icone={Wallet} titulo="Nada neste filtro">
          As festas aparecem aqui quando a reserva é confirmada na Agenda. Em cada uma você monta o
          plano de pagamento e registra o que recebeu.
        </EmptyState>
      ) : (
        <ul className="bg-card rounded-card divide-y border" data-testid="lista-financeiro">
          {t.festas.map((f) => {
            const s = f.situacao;
            const p = s.proxima;
            return (
              <li key={f.reservaId}>
                <Link
                  href={`/app/financeiro/${f.reservaId}`}
                  className="hover:bg-accent/50 flex flex-col gap-1 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  data-testid="item-financeiro"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold break-words">{f.cliente}</span>
                    <span className="text-muted-foreground block text-sm">
                      Festa {formatData(f.data)}
                      {f.tipoEvento && ` · ${f.tipoEvento}`}
                    </span>
                    <span
                      className={cn(
                        'block text-sm',
                        s.status === 'atrasado' ? 'text-erro font-medium' : 'text-muted-foreground',
                      )}
                    >
                      {s.status === 'atrasado'
                        ? `${formatBRL(s.atrasadoCentavos)} atrasado`
                        : p
                          ? `Próximo: ${formatBRL(p.faltaCentavos)} em ${formatData(p.venceEm)}`
                          : s.status === 'sem_plano'
                            ? 'Monte o plano de pagamento'
                            : 'Tudo pago'}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-right text-sm tabular-nums">
                      <span className="block font-semibold">
                        {formatBRL(s.recebidoCentavos)} de {formatBRL(s.totalCentavos)}
                      </span>
                      <span className="text-muted-foreground block">
                        falta {formatBRL(s.saldoCentavos)}
                      </span>
                    </span>
                    <SeloFinanceiro status={s.status} />
                    <PendenteLink />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

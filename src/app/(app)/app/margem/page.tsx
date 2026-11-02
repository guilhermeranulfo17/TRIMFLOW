import type { Metadata } from 'next';
import Link from 'next/link';
import { CustosPacote } from '@/components/app/margem/custos-pacote';
import { ChamadaModulo } from '@/components/app/solucoes/chamada-modulo';
import { podeEscrever } from '@/domain/cobranca/situacao';
import { formatData } from '@/domain/dates';
import { TEXTO_PENDENCIA } from '@/domain/modulos';
import { formatBRL } from '@/domain/money';
import { formatBp } from '@/domain/percent';
import { cn } from '@/lib/utils';
import { AcessoRestrito } from '@/components/app/solucoes/acesso-restrito';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarPainelMargem } from '@/server/modulos/margem';

export const metadata: Metadata = { title: 'OrkMargem' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ABAS = [
  ['festas', 'Festas'],
  ['pacotes', 'Custos dos pacotes'],
  ['comparacao', 'Comparação'],
] as const;

const bp = (v: number | null) => (v === null ? '—' : formatBp(v));

/** OrkMargem (só o dono): festas com margem, previsão por pacote e comparação. */
export default async function MargemPage({ searchParams }: Props) {
  const dono = await exigirSessao();
  if (dono.perfil !== 'dono')
    return <AcessoRestrito texto="Custos e margens das festas: só o dono do buffet vê." />;
  const aba = (await searchParams).aba;
  const atual = ABAS.some(([k]) => k === aba) ? (aba as string) : 'festas';
  const p = await carregarPainelMargem(dono);
  const editavel = p.acesso && !dono.empresa.demo && podeEscrever(dono.empresa.situacao);
  const temHistorico = p.festas.some((f) => f.preparada) || p.pacotes.some((x) => x.custos.length);

  if (!p.acesso && !temHistorico) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">OrkMargem</h1>
        <ChamadaModulo codigo="orkmargem" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">OrkMargem</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Margem de contribuição = receita contratada − custos variáveis. Não é lucro líquido:
          custos fixos e impostos sobre o faturamento não entram.
        </p>
        {!p.acesso && (
          <p className="bg-muted rounded-control mt-3 p-3 text-sm" data-testid="margem-so-leitura">
            O OrkMargem não está ativo: o histórico continua visível, mas nada novo é registrado.{' '}
            <Link
              href="/app/solucoes/orkmargem"
              className="text-primary-texto font-semibold underline"
            >
              Ver a solução
            </Link>
          </p>
        )}
      </header>
      <nav aria-label="Seções do OrkMargem">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {ABAS.map(([k, rotulo]) => (
            <li key={k} className="shrink-0">
              <Link
                href={k === 'festas' ? '/app/margem' : `/app/margem?aba=${k}`}
                aria-current={k === atual ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold',
                  k === atual
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-accent',
                )}
              >
                {rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {atual === 'pacotes' && (
        <section className="flex flex-col gap-3" aria-label="Custos previstos dos pacotes">
          <p className="text-muted-foreground text-sm">
            Cadastre uma vez o custo de cada pacote. Ao preparar uma festa, o Orkestra multiplica
            pelo número de convidados da reserva.
          </p>
          {p.pacotes.length === 0 && <p className="text-sm">Nenhum pacote no catálogo.</p>}
          {p.pacotes.map((x) => (
            <CustosPacote
              key={x.id}
              pacoteId={x.id}
              nome={x.nome}
              custos={x.custos}
              editavel={editavel}
            />
          ))}
        </section>
      )}

      {atual === 'festas' && (
        <ul className="flex flex-col gap-2" data-testid="festas-margem">
          {p.festas.length === 0 && (
            <li className="text-muted-foreground text-sm">
              Nenhuma festa confirmada no último ano.
            </li>
          )}
          {p.festas.map((f) => (
            <li key={f.reservaId}>
              <Link
                href={`/app/margem/${f.reservaId}`}
                className="bg-card rounded-card hover:bg-accent flex flex-col gap-2 border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="block font-semibold break-words">{f.cliente}</span>
                  <span className="text-muted-foreground text-sm">
                    {formatData(f.data)}
                    {f.pacote && ` · ${f.pacote}`}
                    {f.fechada && ' · Fechada'}
                  </span>
                  {f.preparada && f.pendencias.length > 0 && (
                    <span className="text-alerta mt-1 block text-xs font-semibold">
                      {f.pendencias.map((x) => TEXTO_PENDENCIA[x]).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="text-sm tabular-nums sm:text-right">
                  <span className="block">Receita {formatBRL(f.receitaCentavos)}</span>
                  {f.preparada ? (
                    <span className="text-muted-foreground block">
                      Margem prevista {bp(f.resumo.margemPrevistaBp)}
                      {f.resumo.margemRealizadaBp !== null &&
                        ` · realizada ${bp(f.resumo.margemRealizadaBp)}`}
                    </span>
                  ) : (
                    <span className="text-muted-foreground block">Sem previsão</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {atual === 'comparacao' && (
        <section
          className="bg-card rounded-card overflow-x-auto border p-4"
          aria-label="Comparação por pacote"
        >
          {p.comparacao.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Prepare as festas para comparar os pacotes.
            </p>
          ) : (
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="pb-2 font-semibold">Pacote</th>
                  <th className="pb-2 font-semibold">Festas</th>
                  <th className="pb-2 font-semibold">Receita contratada</th>
                  <th className="pb-2 font-semibold">Margem prevista</th>
                  <th className="pb-2 font-semibold">Margem realizada</th>
                </tr>
              </thead>
              <tbody>
                {p.comparacao.map((c) => (
                  <tr key={c.pacote} className="border-t">
                    <th scope="row" className="py-2 text-left font-semibold">
                      {c.pacote}
                    </th>
                    <td className="py-2 tabular-nums">{c.festas}</td>
                    <td className="py-2 tabular-nums">{formatBRL(c.receitaCentavos)}</td>
                    <td className="py-2 tabular-nums">{bp(c.margemPrevistaBp)}</td>
                    <td className="py-2 tabular-nums">
                      {bp(c.margemRealizadaBp)}
                      {c.festasRealizadas > 0 && (
                        <span className="text-muted-foreground text-xs">
                          {' '}
                          ({c.festasRealizadas} com realizado)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

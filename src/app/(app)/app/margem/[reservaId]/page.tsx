import { ArrowLeft, FileX2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/app/empty-state';
import { CustosFesta, PrepararFesta } from '@/components/app/margem/custos-festa';
import { ChamadaModulo } from '@/components/app/solucoes/chamada-modulo';
import { podeEscrever } from '@/domain/cobranca/situacao';
import { formatData } from '@/domain/dates';
import { TEXTO_PENDENCIA } from '@/domain/modulos';
import { formatBRL } from '@/domain/money';
import { formatBp } from '@/domain/percent';
import { AcessoRestrito } from '@/components/app/solucoes/acesso-restrito';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarMargemDaFesta } from '@/server/modulos/margem';

export const metadata: Metadata = { title: 'Resultado da festa' };

type Props = { params: Promise<{ reservaId: string }> };

/** Resultado de uma festa (OrkMargem): receita, recebido, custos e margem de contribuição. */
export default async function MargemFestaPage({ params }: Props) {
  const { reservaId } = await params;
  const dono = await exigirSessao();
  if (dono.perfil !== 'dono')
    return <AcessoRestrito texto="Custos e margens das festas: só o dono do buffet vê." />;
  const m = await carregarMargemDaFesta(dono, reservaId);
  const voltar = (
    <Link
      href="/app/margem"
      className="text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold"
    >
      <ArrowLeft className="size-4" aria-hidden />
      OrkMargem
    </Link>
  );
  if (!m) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {voltar}
        <EmptyState icone={FileX2} titulo="Festa não encontrada">
          Só reservas confirmadas têm resultado. Confirme a pré-reserva na Agenda.
        </EmptyState>
      </div>
    );
  }
  if (!m.acesso && !m.preparada) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {voltar}
        <ChamadaModulo codigo="orkmargem" />
      </div>
    );
  }
  const editavel = m.acesso && !dono.empresa.demo && podeEscrever(dono.empresa.situacao);
  const r = m.resumo;
  const linhas: [string, string, string?][] = [
    [
      'Receita contratada',
      formatBRL(r.receitaContratadaCentavos),
      'O valor vendido (total da reserva).',
    ],
    ['Já recebido', formatBRL(r.recebidoCentavos), 'Do Financeiro.'],
    ['A receber', formatBRL(r.aReceberCentavos), 'Ainda não é dinheiro em caixa.'],
    ['Custo previsto', formatBRL(r.custoPrevistoCentavos)],
    [
      'Custo realizado',
      formatBRL(r.custoRealizadoCentavos),
      r.itensSemRealizado > 0 ? `${r.itensSemRealizado} custo(s) sem valor realizado.` : undefined,
    ],
    [
      'Margem de contribuição prevista',
      `${formatBRL(r.margemPrevistaCentavos)}${r.margemPrevistaBp === null ? '' : ` (${formatBp(r.margemPrevistaBp)})`}`,
    ],
    [
      'Margem de contribuição realizada',
      r.margemRealizadaCentavos === null
        ? '—'
        : `${formatBRL(r.margemRealizadaCentavos)}${r.margemRealizadaBp === null ? '' : ` (${formatBp(r.margemRealizadaBp)})`}`,
      r.margemRealizadaCentavos === null ? 'Registre todos os custos realizados.' : undefined,
    ],
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {voltar}
      <header>
        <h1 className="text-3xl font-semibold tracking-tight break-words">{m.cliente}</h1>
        <p className="text-muted-foreground">
          Festa {formatData(m.data)}
          {m.convidados ? ` · ${m.convidados} convidados` : ''}
          {m.pacote && ` · ${m.pacote}`}
          {' · '}
          <Link
            href={`/app/financeiro/${m.reservaId}`}
            className="text-primary-texto font-semibold underline-offset-2 hover:underline"
          >
            Pagamentos da festa
          </Link>
        </p>
      </header>
      {!m.acesso && (
        <p className="bg-muted rounded-control p-3 text-sm">
          O OrkMargem não está ativo: estes valores ficam para consulta.
        </p>
      )}
      {!m.convidados && (
        <p className="text-muted-foreground text-sm">
          A reserva não tem número de convidados: os custos por convidado do pacote ficam fora da
          previsão. Informe os convidados na reserva ou ajuste os itens à mão.
        </p>
      )}
      {m.pendencias.length > 0 && (
        <p
          className="bg-alerta/10 text-alerta border-alerta/30 rounded-control border p-3 text-sm font-semibold"
          data-testid="pendencias-margem"
        >
          Pendências: {m.pendencias.map((x) => TEXTO_PENDENCIA[x]).join(' · ')}
        </p>
      )}
      <dl
        className="bg-card rounded-card grid gap-x-6 gap-y-3 border p-4 sm:grid-cols-2"
        data-testid="resumo-margem"
      >
        {linhas.map(([rotulo, valor, nota]) => (
          <div key={rotulo} className="border-b pb-2">
            <dt className="text-muted-foreground text-sm">{rotulo}</dt>
            <dd className="text-lg font-bold tabular-nums">{valor}</dd>
            {nota && <dd className="text-muted-foreground text-xs">{nota}</dd>}
          </div>
        ))}
        {m.receitaOrcamento && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground text-sm">No orçamento</dt>
            <dd className="text-sm tabular-nums">
              Pacote {formatBRL(m.receitaOrcamento.pacoteCentavos)} · adicionais e ajustes{' '}
              {formatBRL(m.receitaOrcamento.adicionaisCentavos)}
            </dd>
          </div>
        )}
      </dl>

      {!m.preparada ? (
        editavel && (
          <section className="bg-card rounded-card border p-4">
            <h2 className="mb-3 font-bold">Copiar a previsão</h2>
            <PrepararFesta
              reservaId={m.reservaId}
              pacotes={m.pacotes}
              sugerido={m.pacoteSugerido?.id ?? null}
            />
          </section>
        )
      ) : (
        <>
          <CustosFesta
            key={JSON.stringify(m.itens)}
            reservaId={m.reservaId}
            itens={m.itens}
            editavel={editavel}
            fechada={m.fechada}
          />
          {editavel && !m.fechada && m.itens.every((i) => i.realizadoCentavos === null) && (
            <details className="bg-card rounded-card border p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Mudou o pacote ou os convidados? Copiar a previsão de novo
              </summary>
              <div className="mt-3">
                <PrepararFesta
                  reservaId={m.reservaId}
                  pacotes={m.pacotes}
                  sugerido={m.pacoteSugerido?.id ?? null}
                  substituir
                />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

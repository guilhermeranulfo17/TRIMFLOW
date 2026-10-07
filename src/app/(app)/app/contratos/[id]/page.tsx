import { ArrowLeft, CircleCheck, CircleX, FileX2, Info, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AcoesContrato, VerCpf } from '@/components/app/contratos/acoes-contrato';
import { SeloStatusContrato } from '@/components/app/contratos/selo-contrato';
import { EmptyState } from '@/components/app/empty-state';
import { PendenteLink } from '@/components/app/pendente-link';
import { TextoContrato } from '@/components/contrato/texto-contrato';
import { podeEscrever } from '@/domain/cobranca/situacao';
import { formatData, formatDataHora } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import { exigirPerfil } from '@/server/auth/guards';
import { carregarDetalheContrato, type DetalheContrato } from '@/server/contratos/painel';

export const metadata: Metadata = { title: 'Contrato' };

type Props = { params: Promise<{ id: string }> };

function Faixa({
  tom,
  icone: Icone,
  children,
  testid,
}: {
  tom: 'alerta' | 'info' | 'sucesso' | 'neutro';
  icone: typeof Info;
  children: React.ReactNode;
  testid?: string;
}) {
  const classe = {
    alerta: 'bg-alerta/10 text-alerta border-alerta/30',
    info: 'bg-info/10 text-info border-info/30',
    sucesso: 'bg-sucesso/10 text-sucesso border-sucesso/30',
    neutro: 'bg-muted text-muted-foreground border-border',
  }[tom];
  return (
    <div
      role="status"
      className={cn('rounded-card flex items-start gap-2 border p-3 text-sm', classe)}
      data-testid={testid}
    >
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Resumo({ c }: { c: DetalheContrato }) {
  const r = c.resumo;
  const linhas: [string, string | null][] = [
    ['Festa', r.tipoEvento],
    ['Data', r.data ? formatData(r.data) : null],
    ['Horário', r.horario],
    ['Convidados', r.convidados ? String(r.convidados) : null],
    ['Espaço', r.espaco],
    ['Pacote', r.pacote],
    ['Total', r.totalCentavos !== null ? formatBRL(r.totalCentavos) : null],
    ['Sinal', r.sinalCentavos !== null ? formatBRL(r.sinalCentavos) : null],
    ['Saldo', r.saldoCentavos !== null ? formatBRL(r.saldoCentavos) : null],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
      {linhas
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-semibold break-words">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Detalhe do contrato (só o dono): status, ações, assinaturas, histórico e o texto. */
export default async function ContratoPage({ params }: Props) {
  const { id } = await params;
  const dono = await exigirPerfil('dono');
  const c = await carregarDetalheContrato(dono, id);
  const fuso = dono.empresa.fuso;

  if (!c) {
    return (
      <EmptyState icone={FileX2} titulo="Contrato não encontrado">
        Ele pode ter sido apagado junto com o cliente. Volte para a{' '}
        <Link href="/app/contratos" className="text-primary-texto font-semibold underline">
          lista de contratos
        </Link>
        .
      </EmptyState>
    );
  }

  const somenteLeitura = dono.empresa.demo || !podeEscrever(dono.empresa.situacao);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/app/contratos"
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Contratos
        <PendenteLink />
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Contrato {c.codigo}</h1>
          <SeloStatusContrato status={c.status} />
          {c.versao > 1 && <span className="text-muted-foreground text-sm">versão {c.versao}</span>}
          {c.ehTeste && (
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
              Teste
            </span>
          )}
        </div>
        <p className="text-muted-foreground">
          {c.titulo} ·{' '}
          {c.clienteNome ? (
            <Link
              href={`/app/leads/${c.leadId}`}
              className="text-primary-texto font-semibold underline-offset-2 hover:underline"
              data-testid="abrir-lead"
            >
              {c.clienteNome}
            </Link>
          ) : (
            'Titular removido'
          )}
        </p>
      </header>

      {c.status === 'recusado' && (
        <Faixa tom="alerta" icone={TriangleAlert} testid="faixa-ajuste">
          <p className="font-semibold">
            O cliente pediu ajuste
            {c.recusadoEm && ` em ${formatDataHora(c.recusadoEm, fuso)}`}.
          </p>
          {c.recusaMotivo && <p className="mt-1">&ldquo;{c.recusaMotivo}&rdquo;</p>}
          <p className="mt-1">Converse com o cliente e refaça o contrato com o ajuste.</p>
        </Faixa>
      )}
      {c.status === 'expirado' && (
        <Faixa tom="alerta" icone={TriangleAlert}>
          O link venceu sem assinatura. Gere um link novo para o cliente assinar.
        </Faixa>
      )}
      {c.status === 'cancelado' && (
        <Faixa tom="neutro" icone={CircleX}>
          Cancelado{c.canceladoEm && ` em ${formatDataHora(c.canceladoEm, fuso)}`}
          {c.cancelamentoMotivo && `: ${c.cancelamentoMotivo}`}.
          {c.substituidoPor && (
            <>
              {' '}
              Substituído pelo{' '}
              <Link
                href={`/app/contratos/${c.substituidoPor.id}`}
                className="font-semibold underline"
              >
                contrato {c.substituidoPor.codigo}
              </Link>
              .
            </>
          )}
        </Faixa>
      )}
      {c.status === 'concluido' && (
        <Faixa tom="sucesso" icone={CircleCheck} testid="faixa-assinado">
          Assinado pelas duas partes
          {c.concluidoEm && ` em ${formatDataHora(c.concluidoEm, fuso)}`}. O PDF tem o texto e o
          comprovante das assinaturas.
          {c.copiaEmailEnviadaEm && ' A cópia foi enviada ao e-mail do cliente.'}
        </Faixa>
      )}
      {c.substitui && (
        <Faixa tom="info" icone={Info}>
          Este contrato substitui o{' '}
          <Link href={`/app/contratos/${c.substitui.id}`} className="font-semibold underline">
            contrato {c.substitui.codigo}
          </Link>
          .
        </Faixa>
      )}

      <AcoesContrato
        id={c.id}
        codigo={c.codigo}
        status={c.status}
        orcamentoId={c.orcamentoId}
        somenteLeitura={somenteLeitura}
      />

      <section className="bg-card rounded-card border p-4" aria-labelledby="titulo-resumo">
        <h2 id="titulo-resumo" className="mb-3 font-bold">
          Resumo da festa
        </h2>
        <Resumo c={c} />
      </section>

      <section className="bg-card rounded-card border p-4" aria-labelledby="titulo-assinaturas">
        <h2 id="titulo-assinaturas" className="mb-3 font-bold">
          Assinaturas
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="assinaturas">
          {(['buffet', 'cliente'] as const).map((parte) => {
            const a = c.assinaturas.find((x) => x.parte === parte);
            return (
              <li key={parte} className="rounded-control border p-3 text-sm">
                <p className="text-muted-foreground text-xs font-semibold uppercase">
                  {parte === 'buffet' ? 'Buffet' : 'Cliente'}
                </p>
                {a ? (
                  <>
                    <p className="font-semibold break-words">{a.nome}</p>
                    {a.representa && <p className="text-muted-foreground">por {a.representa}</p>}
                    {a.documento && (
                      <p className="flex flex-wrap items-center gap-x-2">
                        <span className="tabular-nums">{a.documento}</span>
                        {a.temCpf && <VerCpf id={c.id} />}
                      </p>
                    )}
                    <p>{formatDataHora(a.assinadoEm, fuso)}</p>
                    <p className="text-muted-foreground">
                      {a.metodo === 'aceite_com_codigo'
                        ? 'Aceite com código por e-mail'
                        : 'Aceite eletrônico'}
                    </p>
                    <p className={a.confere ? 'text-sucesso' : 'text-erro'}>
                      {a.confere ? 'Texto assinado confere' : 'Texto assinado não confere'}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Ainda não assinou.</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {c.linhaDoTempo.length > 0 && (
        <section className="bg-card rounded-card border p-4" aria-labelledby="titulo-historico">
          <h2 id="titulo-historico" className="mb-3 font-bold">
            Histórico
          </h2>
          <ol className="flex flex-col gap-3" data-testid="historico-contrato">
            {c.linhaDoTempo.map((e, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    e.destaque ? 'bg-primary' : 'bg-muted-foreground/40',
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className={cn('block', e.destaque && 'font-semibold')}>{e.texto}</span>
                  <span className="text-muted-foreground block text-xs">
                    {formatDataHora(e.quando, fuso)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <details className="bg-card rounded-card group border p-4">
        <summary className="flex min-h-11 cursor-pointer items-center font-bold">
          Texto do contrato
        </summary>
        <div className="mt-3">
          {c.anonimizado ? (
            <p className="text-muted-foreground text-sm">
              Os dados do cliente foram removidos (LGPD). O texto não fica mais disponível.
            </p>
          ) : (
            <TextoContrato texto={c.texto} />
          )}
          <p className="text-muted-foreground mt-4 text-xs break-all">
            Impressão digital (SHA-256): {c.hash}
          </p>
        </div>
      </details>
    </div>
  );
}

import { FileSignature, FileText, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SeloStatusContrato } from '@/components/app/contratos/selo-contrato';
import { EmptyState } from '@/components/app/empty-state';
import { PendenteLink } from '@/components/app/pendente-link';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { formatData, formatDataHora } from '@/domain/dates';
import {
  FILTROS_CONTRATO,
  ROTULO_FILTRO_CONTRATO,
  filtroContratoDaUrl,
} from '@/domain/contratos/painel';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import { exigirPerfil } from '@/server/auth/guards';
import { carregarListaContratos, type LinhaContrato } from '@/server/contratos/painel';

export const metadata: Metadata = { title: 'Contratos' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** O que mostrar embaixo do nome: o momento mais importante do status. */
function quando(c: LinhaContrato, fuso: string): string {
  switch (c.status) {
    case 'concluido':
      return c.concluidoEm ? `Assinado em ${formatDataHora(c.concluidoEm, fuso)}` : 'Assinado';
    case 'enviado':
      return c.expiraEm
        ? `${c.visualizadoEm ? 'Aberto pelo cliente' : 'Ainda não aberto'} · link até ${formatData(c.expiraEm, fuso)}`
        : 'Aguardando assinatura';
    case 'expirado':
      return 'O link venceu sem assinatura';
    case 'recusado':
      return 'O cliente pediu ajuste';
    default:
      return c.enviadoEm ? `Enviado em ${formatDataHora(c.enviadoEm, fuso)}` : '';
  }
}

/** Contratos do buffet (só o dono): filtros por status, mais recentes primeiro. */
export default async function ContratosPage({ searchParams }: Props) {
  const dono = await exigirPerfil('dono');
  const filtro = filtroContratoDaUrl((await searchParams).status);
  const { contratos, contagem } = await carregarListaContratos(dono, filtro);
  const fuso = dono.empresa.fuso;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TituloPagina>Contratos</TituloPagina>
        <Link
          href="/app/contratos/modelos"
          className="rounded-control hover:bg-accent inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-semibold"
        >
          <FileText className="size-4" aria-hidden />
          Modelos
          <PendenteLink />
        </Link>
      </div>

      <nav aria-label="Filtrar contratos" data-testid="filtros-contratos">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {FILTROS_CONTRATO.map((f) => {
            const ativo = f === filtro;
            return (
              <li key={f} className="shrink-0">
                <Link
                  href={f === 'todos' ? '/app/contratos' : `/app/contratos?status=${f}`}
                  aria-current={ativo ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors',
                    ativo ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent',
                  )}
                  data-testid={`filtro-contrato-${f}`}
                >
                  {ROTULO_FILTRO_CONTRATO[f]}
                  <span className={cn('text-xs', !ativo && 'text-muted-foreground')}>
                    {contagem[f]}
                  </span>
                  <PendenteLink />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {contratos.length === 0 ? (
        <EmptyState
          icone={FileSignature}
          titulo={filtro === 'todos' ? 'Nenhum contrato ainda' : 'Nada neste filtro'}
        >
          {filtro === 'todos' ? (
            <>
              Abra um lead com orçamento pré-reservado e toque em <strong>Gerar contrato</strong>. O
              cliente assina pelo celular e o PDF fica guardado aqui.
            </>
          ) : (
            'Escolha outro filtro para ver os demais contratos.'
          )}
        </EmptyState>
      ) : (
        <ul className="bg-card rounded-card divide-y border" data-testid="lista-contratos">
          {contratos.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/contratos/${c.id}`}
                className="hover:bg-accent/50 flex flex-col gap-1 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                data-testid="item-contrato"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold break-words">
                      {c.clienteNome ?? 'Titular removido'}
                    </span>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {c.codigo}
                      {c.versao > 1 && ` · v${c.versao}`}
                    </span>
                    {c.ehTeste && (
                      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                        Teste
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground block text-sm">
                    {[
                      c.resumo.data && `Festa ${formatData(c.resumo.data)}`,
                      c.resumo.totalCentavos !== null && formatBRL(c.resumo.totalCentavos),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span
                    className={cn(
                      'block text-sm',
                      c.status === 'recusado' || c.status === 'expirado'
                        ? 'text-alerta font-medium'
                        : 'text-muted-foreground',
                    )}
                  >
                    {(c.status === 'recusado' || c.status === 'expirado') && (
                      <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
                    )}
                    {quando(c, fuso)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <SeloStatusContrato status={c.status} />
                  <PendenteLink />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

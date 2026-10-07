import { ArrowLeft, CalendarPlus, History, UserX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SeloStatusContrato } from '@/components/app/contratos/selo-contrato';
import { EmptyState } from '@/components/app/empty-state';
import { SeloFinanceiro } from '@/components/app/financeiro/selo-financeiro';
import { PendenteLink } from '@/components/app/pendente-link';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { mensagemFestaDeNovo } from '@/domain/clientes';
import { podeEscrever } from '@/domain/cobranca/situacao';
import { formatData } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { formatPhoneBR } from '@/domain/phone';
import { ROTULO_ORIGEM } from '@/domain/publico/origem';
import { linkWhatsApp } from '@/domain/publico/whatsapp';
import { cn } from '@/lib/utils';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarFichaCliente } from '@/server/clientes/carregar';

export const metadata: Metadata = { title: 'Cliente' };

type Props = { params: Promise<{ id: string }> };

const BOTAO =
  'rounded-control inline-flex min-h-11 items-center justify-center gap-2 border px-4 text-sm font-semibold transition-colors hover:bg-accent';

/** Ficha do cliente (Etapa 12): todas as festas, o total e "Nova festa". */
export default async function ClientePage({ params }: Props) {
  const { id } = await params;
  const usuario = await exigirSessao();
  const ficha = await carregarFichaCliente(usuario, id);
  const voltar = (
    <Link
      href="/app/clientes"
      className="text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Clientes
      <PendenteLink />
    </Link>
  );
  if (!ficha) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {voltar}
        <EmptyState icone={UserX} titulo="Cliente não encontrado">
          Só aparece aqui quem tem reserva confirmada na Agenda.
        </EmptyState>
      </div>
    );
  }
  const { cliente: c, festas, hoje, lead } = ficha;
  const dono = usuario.perfil === 'dono';
  const escrever = !usuario.empresa.demo && podeEscrever(usuario.empresa.situacao);
  const ultimaComTipo = festas.find((f) => f.data < hoje) ?? festas[0];
  const mensagem = mensagemFestaDeNovo({
    nome: c.nome,
    buffet: usuario.empresa.nome,
    vendedor: usuario.nome,
    tipoFesta: ultimaComTipo?.tipoEvento,
    ultimaFesta: c.ultimaFesta,
    hoje,
  });
  const novaFesta = c.leadId
    ? `/app/orcamentos/novo?lead=${c.leadId}`
    : c.whatsapp
      ? `/app/orcamentos/novo?reserva=${c.festas.find((f) => f.whatsapp)!.reservaId}`
      : '/app/orcamentos/novo';
  const n = festas.length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {voltar}
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight break-words">{c.nome}</h1>
          {c.horaDeChamar && (
            <span
              className="bg-destaque/15 text-primary-texto border-destaque/40 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
              data-testid="selo-chamar"
            >
              Chamar de novo
            </span>
          )}
        </div>
        <p className="text-muted-foreground break-words">
          {c.whatsapp ? formatPhoneBR(c.whatsapp) : 'Sem WhatsApp'}
          {lead?.email && ` · ${lead.email}`}
          {lead && ` · veio por ${ROTULO_ORIGEM[lead.origem]}`}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="resumo-cliente">
        <div className="bg-card rounded-card border p-4">
          <dt className="text-muted-foreground text-sm">Festas</dt>
          <dd className="mt-1 text-xl font-bold tabular-nums">{n}</dd>
        </div>
        <div className="bg-card rounded-card border p-4">
          <dt className="text-muted-foreground text-sm">Cliente desde</dt>
          <dd className="mt-1 text-xl font-bold tabular-nums">{formatData(c.primeiraFesta)}</dd>
        </div>
        <div className="bg-card rounded-card border p-4">
          <dt className="text-muted-foreground text-sm">
            {c.proximaFesta ? 'Próxima festa' : 'Faz um ano em'}
          </dt>
          <dd className="mt-1 text-xl font-bold tabular-nums">
            {c.proximaFesta
              ? formatData(c.proximaFesta)
              : c.aniversario
                ? formatData(c.aniversario)
                : '-'}
          </dd>
        </div>
        {dono && (
          <div className="bg-card rounded-card border p-4">
            <dt className="text-muted-foreground text-sm">Total em festas</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums" data-testid="total-cliente">
              {formatBRL(c.totalCentavos)}
            </dd>
          </div>
        )}
      </dl>

      <section
        aria-label="Ações do cliente"
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      >
        {c.whatsapp && (
          <a
            href={linkWhatsApp(c.whatsapp, mensagem)}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold"
            data-testid="chamar-whatsapp"
          >
            <IconeWhatsApp />
            {c.horaDeChamar ? 'Chamar para a próxima festa' : 'Chamar no WhatsApp'}
          </a>
        )}
        {escrever && (
          <Link href={novaFesta} className={BOTAO} data-testid="nova-festa">
            <CalendarPlus className="size-4" aria-hidden />
            Nova festa (orçamento)
            <PendenteLink />
          </Link>
        )}
        {c.leadId && (
          <Link href={`/app/leads/${c.leadId}`} className={BOTAO} data-testid="abrir-lead">
            <History className="size-4" aria-hidden />
            Histórico e orçamentos
            <PendenteLink />
          </Link>
        )}
      </section>

      <section aria-labelledby="titulo-festas" className="flex flex-col gap-2">
        <h2 id="titulo-festas" className="text-lg font-semibold">
          Festas
        </h2>
        <ul className="bg-card rounded-card divide-y border" data-testid="festas-cliente">
          {festas.map((f) => {
            const passou = f.data < hoje;
            return (
              <li key={f.reservaId} className="flex flex-col gap-2 p-4" data-testid="festa-cliente">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {formatData(f.data)}
                    {f.tipoEvento && ` · ${f.tipoEvento}`}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
                      passou
                        ? 'bg-muted text-muted-foreground border-border'
                        : 'bg-info/10 text-info border-info/30',
                    )}
                  >
                    {passou ? 'Realizada' : 'Marcada'}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {[f.espaco, f.turno, f.convidados ? `${f.convidados} convidados` : null]
                    .filter(Boolean)
                    .join(' · ')}
                  {dono && f.valorTotalCentavos ? ` · ${formatBRL(f.valorTotalCentavos)}` : ''}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {f.contrato && <SeloStatusContrato status={f.contrato} curto />}
                  {f.financeiro && <SeloFinanceiro status={f.financeiro.status} />}
                  <Link
                    href={`/app/agenda?mes=${f.data.slice(0, 7)}`}
                    className="text-primary-texto inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline"
                  >
                    Ver na Agenda
                  </Link>
                  {dono && (
                    <Link
                      href={`/app/financeiro/${f.reservaId}`}
                      className="text-primary-texto inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline"
                      data-testid="pagamentos-festa"
                    >
                      Pagamentos
                      {f.financeiro && f.financeiro.saldoCentavos > 0
                        ? ` (falta ${formatBRL(f.financeiro.saldoCentavos)})`
                        : ''}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

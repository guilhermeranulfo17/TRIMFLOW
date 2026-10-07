import { Columns3, Inbox, List, ListTodo, UsersRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/app/empty-state';
import { ChecklistPainel } from '@/components/app/onboarding/checklist-painel';
import { FiltrosCaixa } from '@/components/app/leads/filtros-caixa';
import { FunilLeads } from '@/components/app/leads/funil-leads';
import { ListaCaixa } from '@/components/app/leads/lista-caixa';
import { TopoHoje } from '@/components/app/leads/topo-hoje';
import { podeEscrever } from '@/domain/cobranca/situacao';
import {
  contarFiltros,
  filtrosDaUrl,
  filtrosParaUrl,
  type FiltrosCaixa as Filtros,
} from '@/domain/leads/filtros';
import { cn } from '@/lib/utils';
import { exigirSessao } from '@/server/auth/sessao';
import { comUsuario } from '@/server/db/tenant';
import { listarCaixa, resumoHoje, usuariosDaEmpresa } from '@/server/leads/carregar';
import { carregarFunil } from '@/server/leads/funil';
import { carregarChecklist } from '@/server/onboarding/carregar';

export const metadata: Metadata = { title: 'Leads' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Caixa de leads (tela inicial do painel): topo "Hoje" e a lista priorizada (pré-reserva >
 * visita > tarefa > quente > novo > em andamento). Filtros e busca vivem na URL.
 */
export default async function LeadsPage({ searchParams }: Props) {
  const busca = await searchParams;
  // Links antigos (?lead=) abrem a página do lead.
  if (typeof busca.lead === 'string' && /^[0-9a-f-]{36}$/i.test(busca.lead)) {
    redirect(`/app/leads/${busca.lead}`);
  }
  const usuario = await exigirSessao();
  const filtros = filtrosDaUrl(busca);
  // Sem Suspense nem loading.tsx na página: depois de uma ação, o conteúdo dentro deles nem
  // sempre era trocado pelo novo (ARQUITETURA §60). O retorno imediato fica no link clicado
  // (PendenteLink) e nos filtros (transição).
  // Tudo numa transação só (uma leva em pipeline). A página não usa o contexto do painel: ele
  // fica no layout, atrás de Suspense.
  const funil = filtros.visao === 'funil';
  const [resumo, pagina, colunas, usuarios, checklist] = await comUsuario(usuario.id, (tx) =>
    Promise.all([
      resumoHoje(usuario, tx),
      funil ? null : listarCaixa(usuario, filtros, null, 30, tx),
      funil ? carregarFunil(usuario, filtros, tx) : null,
      usuariosDaEmpresa(usuario, tx),
      carregarChecklist(usuario, tx),
    ]),
  );
  const semFiltro = contarFiltros(filtros) === 0 && !filtros.busca && !filtros.atalho;
  const vazioTotal = semFiltro && (pagina ? pagina.cartoes.length === 0 : false);
  const somenteLeitura = usuario.empresa.demo || !podeEscrever(usuario.empresa.situacao);

  return (
    <div className={cn('mx-auto flex flex-col gap-4', funil ? 'max-w-7xl' : 'max-w-3xl')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">Leads</h1>
          <AlternarVisao filtros={filtros} />
        </div>
        <div className="flex gap-2">
          {/* no celular Clientes não cabe na barra de baixo: o atalho fica aqui */}
          <Link
            href="/app/clientes"
            className="rounded-control hover:bg-accent inline-flex min-h-11 items-center gap-2 border px-3 text-sm font-semibold md:hidden"
            data-testid="atalho-clientes"
          >
            <UsersRound className="size-4" aria-hidden />
            Clientes
          </Link>
          <Link
            href="/app/tarefas"
            className="rounded-control hover:bg-accent inline-flex min-h-11 items-center gap-2 border px-3 text-sm font-semibold"
          >
            <ListTodo className="size-4" aria-hidden />
            Tarefas
            {resumo.atrasadas + resumo.tarefasHoje > 0 && (
              <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs tabular-nums">
                {resumo.atrasadas + resumo.tarefasHoje}
              </span>
            )}
          </Link>
        </div>
      </div>
      <ChecklistPainel usuario={usuario} checklist={checklist} />
      {!funil && <TopoHoje resumo={resumo} filtros={filtros} />}
      <FiltrosCaixa filtros={filtros} usuarios={usuarios} />
      {colunas ? (
        <FunilLeads colunas={colunas} somenteLeitura={somenteLeitura} />
      ) : vazioTotal || !pagina ? (
        <EmptyState icone={Inbox} titulo="Caixa em dia">
          Nenhum lead em negociação agora. Quando alguém montar um orçamento pelo seu link, ou você
          criar um pelo botão <strong>+ Orçamento</strong>, ele aparece aqui na ordem de quem
          atender primeiro. Divulgue seu link em{' '}
          <Link
            href="/app/empresa/link"
            className="text-primary-texto font-semibold underline-offset-2 hover:underline"
          >
            Minha empresa
          </Link>
          .
        </EmptyState>
      ) : (
        // key: os filtros mudaram, a lista recomeça do topo
        <ListaCaixa key={filtrosParaUrl(filtros)} inicial={pagina} filtros={filtros} />
      )}
    </div>
  );
}

/** Lista (quem atender primeiro) ou Funil (onde está cada negociação), com os mesmos filtros. */
function AlternarVisao({ filtros }: { filtros: Filtros }) {
  const opcoes = [
    { visao: undefined, rotulo: 'Lista', Icone: List },
    { visao: 'funil' as const, rotulo: 'Funil', Icone: Columns3 },
  ];
  return (
    <nav aria-label="Visão dos leads" className="bg-muted flex rounded-full p-0.5">
      {opcoes.map(({ visao, rotulo, Icone }) => {
        const ativo = filtros.visao === visao;
        // o atalho do topo "Hoje" só existe na lista
        const qs = filtrosParaUrl({
          ...filtros,
          visao,
          atalho: visao ? undefined : filtros.atalho,
        });
        return (
          <Link
            key={rotulo}
            href={`/app/leads${qs ? `?${qs}` : ''}`}
            aria-current={ativo ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold',
              ativo ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            data-testid={`visao-${visao ?? 'lista'}`}
          >
            <Icone className="size-4" aria-hidden />
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

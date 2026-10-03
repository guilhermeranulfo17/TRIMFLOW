import { Inbox, ListTodo } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/app/empty-state';
import { ChecklistPainel } from '@/components/app/onboarding/checklist-painel';
import { FiltrosCaixa } from '@/components/app/leads/filtros-caixa';
import { ListaCaixa } from '@/components/app/leads/lista-caixa';
import { TopoHoje } from '@/components/app/leads/topo-hoje';
import { contarFiltros, filtrosDaUrl, filtrosParaUrl } from '@/domain/leads/filtros';
import { exigirSessao } from '@/server/auth/sessao';
import { comUsuario } from '@/server/db/tenant';
import { listarCaixa, usuariosDaEmpresa } from '@/server/leads/carregar';
import { carregarChecklist } from '@/server/onboarding/carregar';
import { carregarContextoPainel } from '@/server/painel/contexto';

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
  // "Hoje" vem do contexto do painel (mesma leitura do layout); o resto numa transação só
  const [{ resumo }, [pagina, usuarios, checklist]] = await Promise.all([
    carregarContextoPainel(usuario),
    comUsuario(usuario.id, (tx) =>
      Promise.all([
        listarCaixa(usuario, filtros, null, 30, tx),
        usuariosDaEmpresa(usuario, tx),
        carregarChecklist(usuario, tx),
      ]),
    ),
  ]);
  const semFiltro = contarFiltros(filtros) === 0 && !filtros.busca && !filtros.atalho;
  const vazioTotal = semFiltro && pagina.cartoes.length === 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Leads</h1>
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
      <ChecklistPainel usuario={usuario} checklist={checklist} />
      <TopoHoje resumo={resumo} filtros={filtros} />
      <FiltrosCaixa filtros={filtros} usuarios={usuarios} />
      {vazioTotal ? (
        <EmptyState icone={Inbox} titulo="Caixa em dia">
          Nenhum lead em negociação agora. Quando alguém montar um orçamento pelo seu link, ou você
          criar um pelo botão <strong>+ Orçamento</strong>, ele aparece aqui na ordem de quem
          atender primeiro. Divulgue seu link em{' '}
          <Link
            href="/app/empresa/link"
            className="text-primary font-semibold underline-offset-2 hover:underline"
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

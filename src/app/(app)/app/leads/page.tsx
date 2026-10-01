import { Inbox, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/app/empty-state';
import { TituloPagina } from '@/components/app/titulo-pagina';
import {
  COR_STATUS_LEAD,
  FILTROS_LEAD,
  filtroValido,
  haQuantoTempo,
  resumoDaFesta,
} from '@/domain/leads';
import { formatBRL } from '@/domain/money';
import { ROTULO_STATUS_LEAD } from '@/domain/publico/status-lead';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarLead, listarLeads } from '@/server/leads/carregar';
import { DetalheDoLead } from './detalhe';

export const metadata: Metadata = { title: 'Leads' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/** Leads do link público (dono e vendedor). Só leitura nesta etapa. */
export default async function LeadsPage({ searchParams }: Props) {
  const busca = await searchParams;
  const usuario = await exigirSessao();
  const filtro = filtroValido(busca.filtro);
  const q = texto(busca.q)?.slice(0, 60) ?? '';
  const incluirTeste = busca.teste === '1';
  const leadId = texto(busca.lead);
  const [lista, detalhe] = await Promise.all([
    listarLeads(usuario, { filtro, busca: q, incluirTeste }),
    leadId ? carregarLead(usuario, leadId) : null,
  ]);
  const agora = new Date();

  const link = (mudar: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const atual: Record<string, string | null> = {
      filtro: filtro === 'todos' ? null : filtro,
      q: q || null,
      teste: incluirTeste ? '1' : null,
      ...mudar,
    };
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    return `/app/leads${p.size ? `?${p}` : ''}`;
  };
  const vazioTotal = lista.length === 0 && filtro === 'todos' && !q && !incluirTeste;

  return (
    <>
      <TituloPagina>Leads</TituloPagina>
      {vazioTotal ? (
        <EmptyState icone={Inbox} titulo="Nenhum lead ainda">
          Quando alguém montar um orçamento pelo seu link, ele aparece aqui. Copie seu link em{' '}
          <Link
            href="/app/empresa/link"
            className="text-primary font-semibold underline-offset-2 hover:underline"
          >
            Minha empresa
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <form action="/app/leads" className="relative">
            {filtro !== 'todos' && <input type="hidden" name="filtro" value={filtro} />}
            {incluirTeste && <input type="hidden" name="teste" value="1" />}
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar por nome ou WhatsApp"
              aria-label="Buscar lead"
              className="bg-card focus-visible:ring-ring/50 rounded-control h-11 w-full border pr-3 pl-9 text-base focus-visible:ring-[3px] focus-visible:outline-none"
            />
          </form>
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Filtrar leads">
            {FILTROS_LEAD.map((f) => (
              <Link
                key={f.chave}
                href={link({ filtro: f.chave === 'todos' ? null : f.chave })}
                aria-current={filtro === f.chave ? 'page' : undefined}
                className={`inline-flex min-h-10 shrink-0 items-center rounded-full border px-3 text-sm font-semibold ${filtro === f.chave ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent'}`}
              >
                {f.rotulo}
              </Link>
            ))}
          </nav>
          <Link
            href={link({ teste: incluirTeste ? null : '1' })}
            className="text-muted-foreground self-start text-sm underline-offset-2 hover:underline"
          >
            {incluirTeste ? 'Esconder leads de teste' : 'Mostrar leads de teste'}
          </Link>

          {lista.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">Nenhum lead com esse filtro.</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="lista-leads">
              {lista.map((l) => {
                const festa = l.orcamento ? resumoDaFesta(l.orcamento) : '';
                return (
                  <li
                    key={l.id}
                    className="bg-card rounded-card relative border p-4 hover:shadow-sm"
                    data-testid="card-lead"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={link({ lead: l.id })}
                          scroll={false}
                          className="font-bold break-words after:absolute after:inset-0"
                        >
                          {l.nome}
                        </Link>
                        {festa && <p className="text-muted-foreground mt-0.5 text-sm">{festa}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR_STATUS_LEAD[l.status]}`}
                        >
                          {ROTULO_STATUS_LEAD[l.status]}
                        </span>
                        {l.ehTeste && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                            Teste
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold">
                        {l.orcamento?.totalCentavos != null
                          ? formatBRL(l.orcamento.totalCentavos)
                          : ''}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-3">
                        {haQuantoTempo(new Date(l.ultimaAtividadeEm), agora)}
                        <a
                          href={`https://wa.me/${l.whatsappE164.replace('+', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary relative z-10 font-semibold underline-offset-2 hover:underline"
                        >
                          WhatsApp
                        </a>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {detalhe && <DetalheDoLead lead={detalhe} fecharHref={link({ lead: null })} />}
    </>
  );
}

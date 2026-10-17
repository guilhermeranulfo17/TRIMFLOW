import type { Metadata } from 'next';
import { Plus, Upload, Users } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/app/empty-state';
import { formatData } from '@/domain/dates';
import { ROTULO_ETAPA_VENDAS } from '@/domain/vendas/etapas';
import { exigirAdmin } from '@/server/interno/guard';
import { listarLeadsVendas } from '@/server/vendas/leads';

export const metadata: Metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function PaginaLeads({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirAdmin();
  const busca = um((await searchParams).q);
  const leads = await listarLeadsVendas(busca);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex min-w-0 flex-1 basis-full gap-2 sm:basis-0" role="search">
          <input
            name="q"
            defaultValue={busca ?? ''}
            placeholder="Buscar por nome, buffet, cidade ou telefone"
            aria-label="Buscar lead"
            className="rounded-control border-input bg-card h-11 min-w-0 flex-1 border px-3"
          />
          <button type="submit" className="rounded-control min-h-11 border px-4 font-semibold">
            Buscar
          </button>
        </form>
        <Link
          href="/interno/vendas/leads/importar"
          className="rounded-control inline-flex min-h-11 items-center gap-1.5 border px-4 font-semibold whitespace-nowrap"
          data-testid="importar-csv"
        >
          <Upload className="size-4" aria-hidden />
          Importar CSV
        </Link>
        <Link
          href="/interno/vendas/leads/novo"
          className="bg-primary text-primary-foreground rounded-control inline-flex min-h-11 items-center gap-1.5 px-4 font-semibold whitespace-nowrap"
          data-testid="novo-lead"
        >
          <Plus className="size-4" aria-hidden />
          Novo lead
        </Link>
      </div>

      {leads.length === 0 ? (
        <EmptyState icone={Users} titulo={busca ? 'Nenhum lead encontrado' : 'Nenhum lead ainda'}>
          {busca
            ? 'Tente outro nome, cidade ou telefone.'
            : 'Cadastre donos de buffet à mão ou importe uma planilha CSV.'}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="lista-leads-vendas">
          {leads.map((l) => (
            <li key={l.id}>
              <Link
                href={`/interno/vendas/leads/${l.id}`}
                className="bg-card rounded-card hover:border-ring flex flex-col gap-1 border p-4"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {l.nome}
                    {l.buffet && <span className="text-muted-foreground"> · {l.buffet}</span>}
                  </span>
                  <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-semibold">
                    {ROTULO_ETAPA_VENDAS[l.etapa]}
                  </span>
                </span>
                <span className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {l.cidade && <span>{l.cidade}</span>}
                  {l.telefone && <span>{l.telefone}</span>}
                  {l.proximoFollowup && <span>Follow-up {formatData(l.proximoFollowup)}</span>}
                  {l.naoContatar && (
                    <span className="bg-erro/10 text-erro border-erro/30 rounded-full border px-2">
                      Não contatar
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

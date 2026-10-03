import type { Metadata } from 'next';
import Link from 'next/link';
import { BotaoSairInterno } from '@/components/interno/acoes-empresa';
import { rotuloMotivo } from '@/domain/cobranca/motivos-cancelamento';
import { formatData } from '@/domain/dates';
import { formatBp } from '@/domain/percent';
import { formatBRL } from '@/domain/money';
import { diasRestantesTeste, rotuloPlano } from '@/domain/plano';
import { exigirAdmin } from '@/server/interno/guard';
import { listarEmpresasInternas, visaoGeralInterna } from '@/server/interno/carregar';

export const metadata: Metadata = { title: 'Visão geral' };
export const dynamic = 'force-dynamic';

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** /interno: números do negócio e a lista de empresas. */
export default async function PaginaInterna({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await exigirAdmin();
  const busca = um((await searchParams).q);
  const empresas = await listarEmpresasInternas(busca);
  const r = await visaoGeralInterna(empresas);
  const cartoes = [
    { rotulo: 'MRR', valor: formatBRL(r.mrrCentavos) },
    { rotulo: 'Pagantes', valor: String(r.pagantes) },
    { rotulo: 'Testes ativos', valor: String(r.testesAtivos) },
    { rotulo: 'Teste → pago', valor: r.conversaoBp === null ? '—' : formatBp(r.conversaoBp) },
  ];
  return (
    <div className="flex flex-col gap-6" data-testid="interno">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Orkestra interno</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{admin.email}</span>
          <BotaoSairInterno />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="bg-card rounded-card border p-4">
            <p className="text-muted-foreground text-xs">{c.rotulo}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{c.valor}</p>
          </div>
        ))}
      </section>

      {r.cancelamentos.length > 0 && (
        <section className="bg-card rounded-card border p-4">
          <h2 className="mb-2 font-bold">Cancelamentos por motivo</h2>
          <ul className="text-sm">
            {r.cancelamentos.map((c) => (
              <li key={c.motivo} className="flex justify-between py-1">
                <span>{rotuloMotivo(c.motivo)}</span>
                <span className="tabular-nums">{c.quantidade}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <form className="flex gap-2" role="search">
          <input
            name="q"
            defaultValue={busca ?? ''}
            placeholder="Buscar por nome ou link"
            aria-label="Buscar empresa"
            className="rounded-control border-input bg-card h-11 min-w-0 flex-1 border px-3"
          />
          <button type="submit" className="rounded-control min-h-11 border px-4 font-semibold">
            Buscar
          </button>
        </form>
        <ul className="flex flex-col gap-2" data-testid="lista-empresas-internas">
          {empresas.map((e) => (
            <li key={e.id}>
              <Link
                href={`/interno/empresas/${e.id}`}
                className="bg-card rounded-card hover:border-ring flex flex-col gap-1 border p-4"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{e.nome}</span>
                  <span className="text-muted-foreground text-xs">
                    {rotuloPlano(e.situacao, diasRestantesTeste(e.trialAte))}
                  </span>
                </span>
                <span className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span>{e.plano ? `${e.plano} ${e.ciclo ?? ''}` : 'sem assinatura'}</span>
                  <span>MRR {formatBRL(e.mrrCentavos)}</span>
                  <span>Cadastro {formatData(e.criadoEm)}</span>
                  <span>Último acesso {e.ultimoAcesso ? formatData(e.ultimoAcesso) : '—'}</span>
                  <span>
                    Onboarding {e.onboardingConcluido ? 'concluído' : `passo ${e.onboardingPasso}`}
                  </span>
                  <span>{e.leads30d} leads (30 dias)</span>
                  <span>{e.reservas} reservas</span>
                  {e.isenta && <span>cortesia</span>}
                  {e.suporteAte && <span className="text-primary">suporte liberado</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

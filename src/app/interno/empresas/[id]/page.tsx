import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AcoesEmpresa } from '@/components/interno/acoes-empresa';
import { formatData, formatDataHora } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { diasRestantesTeste, rotuloPlano } from '@/domain/plano';
import { exigirAdmin } from '@/server/interno/guard';
import { detalheEmpresaInterna } from '@/server/interno/carregar';

export const metadata: Metadata = { title: 'Empresa' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/;

export default async function EmpresaInterna({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const e = await detalheEmpresaInterna(id);
  if (!e) notFound();
  return (
    <div className="flex flex-col gap-5" data-testid="empresa-interna">
      <Link href="/interno" className="text-primary text-sm font-semibold">
        ← Voltar
      </Link>
      <header>
        <h1 className="text-2xl font-bold">{e.nome}</h1>
        <p className="text-muted-foreground text-sm">
          /b/{e.slug} · {rotuloPlano(e.situacao, diasRestantesTeste(e.trialAte))}
          {e.isenta && ' · cortesia'}
          {e.suspensaManual && ' · suspensa pela equipe'}
        </p>
      </header>

      <section className="bg-card rounded-card grid gap-2 border p-4 text-sm sm:grid-cols-2">
        <p>Dono: {e.dono ? `${e.dono.nome} (${e.dono.email})` : '—'}</p>
        <p>Usuários ativos: {e.usuariosAtivos}</p>
        <p>Teste até: {e.trialAte ? formatDataHora(e.trialAte) : '—'}</p>
        <p>
          Assinatura:{' '}
          {e.plano
            ? `${e.plano} ${e.ciclo} · ${formatBRL(e.valorCentavos ?? 0)} · ${e.statusAssinatura}`
            : '—'}
        </p>
        <p>Pagador: {e.pagador ? `${e.pagador.nome} · ${e.pagador.documento}` : '—'}</p>
        <p>
          Leads (30 dias): {e.leads30d} · Reservas: {e.reservas}
        </p>
        <p>Suporte liberado até: {e.suporteAte ? formatDataHora(e.suporteAte) : 'não'}</p>
      </section>

      <section className="bg-card rounded-card border p-4">
        <h2 className="mb-3 text-lg font-bold">Ações</h2>
        <AcoesEmpresa
          empresaId={e.id}
          suspensaManual={e.suspensaManual}
          isenta={e.isenta}
          suporteLiberado={!!e.suporteAte}
          temAssinatura={!!e.statusAssinatura && e.statusAssinatura !== 'cancelada'}
        />
      </section>

      {e.faturas.length > 0 && (
        <section className="bg-card rounded-card border p-4">
          <h2 className="mb-2 text-lg font-bold">Faturas</h2>
          <ul className="text-sm">
            {e.faturas.map((f, i) => (
              <li key={i} className="flex flex-wrap gap-x-3 py-1">
                <span>{formatData(f.vencimento)}</span>
                <span>{formatBRL(f.valorCentavos)}</span>
                <span className="text-muted-foreground">{f.status}</span>
                {f.tipo === 'implantacao' && (
                  <span className="text-muted-foreground">implantação</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-card rounded-card border p-4">
        <h2 className="mb-2 text-lg font-bold">Histórico da equipe</h2>
        {e.auditoria.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nada ainda.</p>
        ) : (
          <ul className="text-sm">
            {e.auditoria.map((a, i) => (
              <li key={i} className="flex flex-wrap gap-x-3 py-1">
                <span className="tabular-nums">{formatDataHora(a.quando)}</span>
                <span>{a.acao}</span>
                <span className="text-muted-foreground">{a.admin}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

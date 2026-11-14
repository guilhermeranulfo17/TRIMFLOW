import type { Metadata } from 'next';
import Link from 'next/link';
import { AREAS_USO } from '@/domain/uso/areas';
import { formatData } from '@/domain/dates';
import { cn } from '@/lib/utils';
import { exigirAdmin } from '@/server/interno/guard';
import { carregarRadar } from '@/server/interno/radar';

export const metadata: Metadata = { title: 'Radar de uso' };
export const dynamic = 'force-dynamic';

// níveis de calor só com tokens do tema (nada de cor fixa)
const CALOR = [
  'bg-muted text-muted-foreground',
  'bg-primary/15',
  'bg-primary/35',
  'bg-primary/60',
  'bg-primary text-primary-foreground',
] as const;

const curto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** /interno/radar: mapa de calor do uso do painel pelos buffets (§92). */
export default async function PaginaRadar() {
  await exigirAdmin();
  const { radar, empresas } = await carregarRadar(8);
  const poucoUsadas = radar.linhas.filter((l) => l.total > 0 && l.alcance < 20);
  const nuncaUsadas = radar.linhas.filter((l) => l.total === 0 && l.area !== 'outra');

  return (
    <div className="flex flex-col gap-6" data-testid="radar-uso">
      <header className="flex flex-col gap-2">
        <Link href="/interno" className="text-muted-foreground text-sm">
          Voltar para a visão geral
        </Link>
        <h1 className="text-2xl font-bold">Radar de uso</h1>
        <p className="text-muted-foreground text-sm">
          Quantas vezes cada área do painel foi aberta pelos buffets nas últimas 8 semanas (só
          contagem, sem dado pessoal; demo e contas de apresentação ficam fora).{' '}
          {radar.empresasAtivas} {radar.empresasAtivas === 1 ? 'empresa usou' : 'empresas usaram'} o
          painel no período.
        </p>
      </header>

      <section className="bg-card rounded-card overflow-x-auto border p-4">
        <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="text-left font-medium">Área</th>
              {radar.semanas.map((s) => (
                <th key={s} className="text-muted-foreground text-xs font-normal">
                  {curto(s)}
                </th>
              ))}
              <th className="text-right font-medium">Total</th>
              <th className="text-right font-medium">Empresas</th>
            </tr>
          </thead>
          <tbody>
            {radar.linhas.map((l) => (
              <tr key={l.area} data-testid={`radar-${l.area}`}>
                <td className="pr-2 whitespace-nowrap">{l.rotulo}</td>
                {l.semanas.map((c, i) => (
                  <td
                    key={i}
                    className={cn(
                      'rounded-control h-8 min-w-10 text-center text-xs tabular-nums',
                      CALOR[c.nivel],
                    )}
                    title={`${c.acessos} acessos`}
                  >
                    {c.acessos || ''}
                  </td>
                ))}
                <td className="text-right font-semibold tabular-nums">{l.total}</td>
                <td className="text-right tabular-nums">
                  {l.empresas} <span className="text-muted-foreground text-xs">({l.alcance}%)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="bg-card rounded-card border p-4">
          <h2 className="mb-2 font-bold">Pouco usadas (menos de 20% das empresas)</h2>
          {poucoUsadas.length ? (
            <ul className="text-sm">
              {poucoUsadas.map((l) => (
                <li key={l.area} className="flex justify-between py-1">
                  <span>{l.rotulo}</span>
                  <span className="tabular-nums">{l.alcance}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Nenhuma.</p>
          )}
        </div>
        <div className="bg-card rounded-card border p-4">
          <h2 className="mb-2 font-bold">Nunca abertas no período</h2>
          {nuncaUsadas.length ? (
            <ul className="text-sm">
              {nuncaUsadas.map((l) => (
                <li key={l.area} className="py-1">
                  {l.rotulo}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Todas foram abertas.</p>
          )}
        </div>
      </section>

      <section className="bg-card rounded-card border p-4">
        <h2 className="mb-2 font-bold">Empresas nos últimos 30 dias</h2>
        {empresas.length ? (
          <ul className="flex flex-col divide-y text-sm">
            {empresas.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/interno/empresas/${e.id}`} className="font-semibold">
                  {e.nome}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {e.acessos} acessos · {e.areas} de {AREAS_USO.length - 1} áreas
                  {e.ultimoDia ? ` · último uso ${formatData(e.ultimoDia)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Ainda sem uso registrado.</p>
        )}
      </section>
    </div>
  );
}

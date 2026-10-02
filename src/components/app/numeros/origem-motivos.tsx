import { rotuloMotivoPerda } from '@/domain/leads/motivos-perda';
import { formatBRL } from '@/domain/money';
import type { LinhaMotivo, LinhaOrigem } from '@/domain/numeros';
import { formatBp } from '@/domain/percent';
import { ROTULO_ORIGEM } from '@/domain/publico/origem';
import { Barra } from './barra';
import { Bloco, TabelaDoGrafico } from './comum';

/** Por origem: leads, reservas, conversão e valor, ordenado por valor reservado. */
export function PorOrigem({ linhas }: { linhas: LinhaOrigem[] }) {
  return (
    <Bloco
      titulo="De onde vem quem fecha"
      descricao="Por origem do lead, ordenado pelo valor reservado."
      testid="por-origem"
    >
      {linhas.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum lead no período.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[22rem] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-1 py-1 font-medium">Origem</th>
                <th className="px-1 py-1 text-right font-medium">Leads</th>
                <th className="px-1 py-1 text-right font-medium">Reservas</th>
                <th className="px-1 py-1 text-right font-medium">Conversão</th>
                <th className="px-1 py-1 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.origem} className="border-t" data-testid={`origem-${l.origem}`}>
                  <td className="px-1 py-2">{ROTULO_ORIGEM[l.origem] ?? l.origem}</td>
                  <td className="px-1 py-2 text-right tabular-nums">{l.leads}</td>
                  <td className="px-1 py-2 text-right tabular-nums">{l.reservas}</td>
                  <td className="px-1 py-2 text-right tabular-nums">
                    {l.conversaoBp === null ? '—' : formatBp(l.conversaoBp)}
                  </td>
                  <td className="px-1 py-2 text-right tabular-nums">
                    {formatBRL(l.valorReservadoCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bloco>
  );
}

/** Motivos de perda em barras horizontais com contagem e %. */
export function MotivosDePerda({ linhas }: { linhas: LinhaMotivo[] }) {
  const max = Math.max(1, ...linhas.map((l) => l.quantidade));
  return (
    <Bloco
      titulo="Por que perdemos"
      descricao="Leads marcados como perdidos no período."
      testid="motivos-perda"
    >
      {linhas.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum lead perdido no período.</p>
      ) : (
        <>
          <ul
            className="flex flex-col gap-3"
            role="img"
            aria-label={`Motivos de perda: ${linhas.map((l) => `${rotuloMotivoPerda(l.motivo) ?? l.motivo} ${l.quantidade} (${formatBp(l.bp)})`).join('; ')}`}
          >
            {linhas.map((l) => (
              <li key={l.motivo} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{rotuloMotivoPerda(l.motivo) ?? l.motivo}</span>
                  <span className="tabular-nums">
                    <strong>{l.quantidade}</strong>{' '}
                    <span className="text-muted-foreground">· {formatBp(l.bp)}</span>
                  </span>
                </div>
                <Barra fracao={l.quantidade / max} tom="destaque" />
              </li>
            ))}
          </ul>
          <TabelaDoGrafico
            titulo="motivos de perda"
            cabecalho={['Motivo', 'Leads', '%']}
            linhas={linhas.map((l) => [
              rotuloMotivoPerda(l.motivo) ?? l.motivo,
              l.quantidade,
              formatBp(l.bp),
            ])}
          />
        </>
      )}
    </Bloco>
  );
}

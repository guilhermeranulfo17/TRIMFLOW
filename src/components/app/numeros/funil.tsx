import { montarFunil, type Resumo } from '@/domain/numeros';
import { formatBp } from '@/domain/percent';
import { Barra } from './barra';
import { Bloco, TabelaDoGrafico } from './comum';

/** Funil (barras em SVG) com a taxa entre etapas e a maior queda em texto. */
export function Funil({ resumo }: { resumo: Resumo }) {
  const { etapas, maiorQueda } = montarFunil(resumo);
  const max = Math.max(1, ...etapas.map((e) => e.quantidade));
  const descricao = etapas
    .map(
      (e) =>
        `${e.rotulo}: ${e.quantidade}${e.taxaBp === null ? '' : ` (${formatBp(e.taxaBp)} da etapa anterior)`}`,
    )
    .join('; ');
  return (
    <Bloco
      titulo="Funil do link"
      descricao="De quem abriu o link até quem reservou, no período."
      testid="funil"
    >
      {maiorQueda && (
        <p
          className="rounded-control bg-alerta/10 text-alerta px-3 py-2 text-sm"
          data-testid="maior-queda"
        >
          {maiorQueda}
        </p>
      )}
      <ol className="flex flex-col gap-3" role="img" aria-label={`Funil: ${descricao}`}>
        {etapas.map((e) => (
          <li key={e.chave} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{e.rotulo}</span>
              <span className="tabular-nums">
                <strong>{e.quantidade}</strong>
                {e.taxaBp !== null && (
                  <span className="text-muted-foreground"> · {formatBp(e.taxaBp)}</span>
                )}
              </span>
            </div>
            <Barra fracao={e.quantidade / max} />
          </li>
        ))}
      </ol>
      <TabelaDoGrafico
        titulo="funil"
        cabecalho={['Etapa', 'Quantidade', 'Da etapa anterior']}
        linhas={etapas.map((e) => [
          e.rotulo,
          e.quantidade,
          e.taxaBp === null ? '—' : formatBp(e.taxaBp),
        ])}
      />
    </Bloco>
  );
}

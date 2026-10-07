import { Bloco } from './comum';
import { duracaoCurta, type MetricasContratos } from '@/domain/numeros/contratos';

/** Contratos no período (Etapa 10, só o dono): enviados, assinados e tempo médio até assinar. */
export function ContratosNumeros({ m }: { m: MetricasContratos }) {
  const itens: [string, string][] = [
    ['Enviados', String(m.enviados)],
    ['Assinados', String(m.assinados)],
    ['Tempo até assinar', m.tempoMedioMin === null ? 'sem dados' : duracaoCurta(m.tempoMedioMin)],
  ];
  return (
    <Bloco
      titulo="Contratos"
      descricao="Contratos de teste não contam. O tempo é a média dos assinados no período."
      testid="numeros-contratos"
    >
      <dl className="grid grid-cols-3 gap-3">
        {itens.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-muted-foreground text-sm">{k}</dt>
            <dd className="text-2xl font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </Bloco>
  );
}

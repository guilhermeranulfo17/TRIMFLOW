import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatBp } from '@/domain/percent';
import { cn } from '@/lib/utils';

/** Bloco da tela de Números. */
export function Bloco({
  titulo,
  descricao,
  children,
  testid,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <section
      className="bg-card rounded-card flex min-w-0 flex-col gap-3 p-4 md:p-5"
      data-testid={testid}
    >
      <div>
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {descricao && <p className="text-muted-foreground text-sm">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

/** Tabela com os números de um gráfico (acessível; recolhida por padrão). */
export function TabelaDoGrafico({
  titulo,
  cabecalho,
  linhas,
}: {
  titulo: string;
  cabecalho: string[];
  linhas: (string | number)[][];
}) {
  return (
    <details className="text-sm">
      <summary className="text-muted-foreground min-h-11 cursor-pointer content-center">
        Ver tabela: {titulo}
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-muted-foreground">
              {cabecalho.map((c) => (
                <th key={c} className="py-1 pr-3 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i} className="border-t">
                {l.map((c, j) => (
                  <td key={j} className="py-1 pr-3 tabular-nums">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** "↑ 25%" / "↓ 10%" / "—" contra o período anterior. */
export function Variacao({ bp, inverter = false }: { bp: number | null; inverter?: boolean }) {
  if (bp === null) {
    return (
      <span
        className="text-muted-foreground inline-flex items-center gap-1 text-xs"
        aria-label="Sem base de comparação"
      >
        <Minus className="size-3" aria-hidden /> sem comparação
      </span>
    );
  }
  const subiu = bp > 0;
  const bom = inverter ? !subiu : subiu;
  const Icone = bp === 0 ? Minus : subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold',
        bp === 0 ? 'text-muted-foreground' : bom ? 'text-primary-texto' : 'text-erro',
      )}
      aria-label={`${subiu ? 'Subiu' : bp === 0 ? 'Igual' : 'Caiu'} ${formatBp(Math.abs(bp))} contra o período anterior`}
    >
      <Icone className="size-3.5" aria-hidden />
      {formatBp(Math.abs(bp))}
    </span>
  );
}

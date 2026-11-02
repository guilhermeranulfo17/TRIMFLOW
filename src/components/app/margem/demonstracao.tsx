import { ROTULO_CATEGORIA, resumoMargem, type ItemCustoFesta } from '@/domain/modulos';
import { formatBp } from '@/domain/percent';
import { formatBRL } from '@/domain/money';

/** Festa fictícia (sem dados de clientes): a mesma conta do OrkMargem. */
const ITENS: ItemCustoFesta[] = [
  {
    categoria: 'alimentacao',
    descricao: ROTULO_CATEGORIA.alimentacao,
    previstoCentavos: 210000,
    realizadoCentavos: 228000,
  },
  {
    categoria: 'bebidas',
    descricao: ROTULO_CATEGORIA.bebidas,
    previstoCentavos: 48000,
    realizadoCentavos: 48000,
  },
  {
    categoria: 'equipe',
    descricao: ROTULO_CATEGORIA.equipe,
    previstoCentavos: 80000,
    realizadoCentavos: 80000,
  },
  {
    categoria: 'decoracao',
    descricao: ROTULO_CATEGORIA.decoracao,
    previstoCentavos: 35000,
    realizadoCentavos: 31000,
  },
];

export function DemonstracaoMargem() {
  const r = resumoMargem({
    receitaContratadaCentavos: 775000,
    recebidoCentavos: 232500,
    itens: ITENS,
  });
  const linhas: [string, number][] = [
    ['Receita contratada', r.receitaContratadaCentavos],
    ['Já recebido', r.recebidoCentavos],
    ['A receber (não é dinheiro em caixa)', r.aReceberCentavos],
    ['Custo previsto', r.custoPrevistoCentavos],
    ['Custo realizado', r.custoRealizadoCentavos],
  ];
  return (
    <section
      className="bg-card rounded-card border p-5"
      aria-labelledby="titulo-demo"
      data-testid="demonstracao"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-demo" className="font-bold">
          Demonstração
        </h2>
        <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold">
          Dados fictícios
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">Uma festa de exemplo com 60 convidados.</p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {linhas.map(([rotulo, v]) => (
          <div key={rotulo} className="flex justify-between gap-3 border-b pb-2">
            <dt className="text-muted-foreground">{rotulo}</dt>
            <dd className="font-semibold tabular-nums">{formatBRL(v)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-b pb-2">
          <dt className="text-muted-foreground">Margem de contribuição prevista</dt>
          <dd className="font-semibold tabular-nums">
            {formatBRL(r.margemPrevistaCentavos)} ({formatBp(r.margemPrevistaBp ?? 0)})
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b pb-2">
          <dt className="text-muted-foreground">Margem de contribuição realizada</dt>
          <dd className="font-semibold tabular-nums">
            {formatBRL(r.margemRealizadaCentavos ?? 0)} ({formatBp(r.margemRealizadaBp ?? 0)})
          </dd>
        </div>
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">
        Margem de contribuição não é lucro líquido: aluguel, salários fixos e impostos sobre o
        faturamento não entram nesta conta.
      </p>
    </section>
  );
}

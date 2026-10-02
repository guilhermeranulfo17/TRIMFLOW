import { formatBRL } from '@/domain/money';
import { formatarMinutos, variacaoBp, type Resumo } from '@/domain/numeros';
import { formatBp } from '@/domain/percent';
import { Variacao } from './comum';

type Cartao = {
  titulo: string;
  valor: string;
  variacao: number | null | 'agora';
  dica?: string;
  testid: string;
};

function Cartoes({ cartoes }: { cartoes: Cartao[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="cartoes-numeros">
      {cartoes.map((c) => (
        <div
          key={c.titulo}
          className="bg-card rounded-card flex min-w-0 flex-col gap-1 p-4"
          data-testid={c.testid}
        >
          <p className="text-muted-foreground text-sm">{c.titulo}</p>
          <p
            className="text-xl font-light tracking-tight break-words tabular-nums sm:text-3xl"
            data-testid={`${c.testid}-valor`}
          >
            {c.valor}
          </p>
          {c.variacao === 'agora' ? (
            <span className="text-muted-foreground text-xs">{c.dica}</span>
          ) : (
            <Variacao bp={c.variacao} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Dono: Reservas, Valor reservado, Conversão e Em aberto. */
export function CartoesDono({ atual, anterior }: { atual: Resumo; anterior: Resumo }) {
  return (
    <Cartoes
      cartoes={[
        {
          titulo: 'Reservas',
          valor: String(atual.reservas),
          variacao: variacaoBp(atual.reservas, anterior.reservas),
          testid: 'cartao-reservas',
        },
        {
          titulo: 'Valor reservado',
          valor: formatBRL(atual.valorReservadoCentavos),
          variacao: variacaoBp(atual.valorReservadoCentavos, anterior.valorReservadoCentavos),
          testid: 'cartao-valor',
        },
        {
          titulo: 'Conversão',
          valor: atual.conversaoBp === null ? '—' : formatBp(atual.conversaoBp),
          variacao:
            atual.conversaoBp === null || anterior.conversaoBp === null
              ? null
              : atual.conversaoBp - anterior.conversaoBp,
          testid: 'cartao-conversao',
        },
        {
          titulo: 'Em aberto',
          valor: formatBRL(atual.emAbertoCentavos),
          variacao: 'agora',
          dica: 'propostas em negociação hoje',
          testid: 'cartao-aberto',
        },
      ]}
    />
  );
}

/** Vendedor: os leads dele, as reservas dele e o tempo até a primeira ação. */
export function CartoesVendedor({
  atual,
  anterior,
  medianaMin,
}: {
  atual: Resumo;
  anterior: Resumo;
  medianaMin: number | null;
}) {
  return (
    <Cartoes
      cartoes={[
        {
          titulo: 'Seus leads',
          valor: String(atual.leads),
          variacao: variacaoBp(atual.leads, anterior.leads),
          testid: 'cartao-leads',
        },
        {
          titulo: 'Suas reservas',
          valor: String(atual.reservas),
          variacao: variacaoBp(atual.reservas, anterior.reservas),
          testid: 'cartao-reservas',
        },
        {
          titulo: 'Tempo até a 1ª ação',
          valor: formatarMinutos(medianaMin),
          variacao: 'agora',
          dica: 'mediana no período',
          testid: 'cartao-tempo',
        },
      ]}
    />
  );
}

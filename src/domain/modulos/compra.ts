import { somarDias, somarMeses, type DataCivil } from '../dates';
import { formatBRL, type Centavos } from '../money';

/*
 * Resumo da compra de um módulo, montado no servidor com o preço do banco. A cobrança mensal é
 * uma assinatura própria do módulo no Asaas: primeiro vencimento hoje, depois a cada mês, sem
 * proporcional (o Asaas não calcula pró-rata). O acesso só começa depois da confirmação do
 * pagamento pelo provedor.
 */

export type CobrancaModulo = 'mensal' | 'por_evento';

export type ModuloPreco = {
  nome: string;
  cobranca: CobrancaModulo;
  precoCentavos: Centavos;
  carenciaDias: number;
  /** por evento: dias de acesso depois da festa (null = política não definida) */
  acessoEventoDias: number | null;
};

export type ResumoCompra = {
  agoraCentavos: Centavos;
  /** null = sem cobrança recorrente (por evento) */
  recorrenteCentavos: Centavos | null;
  primeiroVencimento: DataCivil;
  /** próxima cobrança depois da primeira (mensal) */
  proximaCobranca: DataCivil | null;
  /** por evento: último dia de acesso (data da festa + dias do módulo) */
  acessoAte: DataCivil | null;
  linhas: { rotulo: string; texto: string }[];
};

export function regraDeCobranca(m: ModuloPreco): string {
  return m.cobranca === 'mensal'
    ? `${formatBRL(m.precoCentavos)} por mês, numa assinatura à parte da assinatura do sistema.`
    : `${formatBRL(m.precoCentavos)} por festa, cobrança única que ativa só a festa escolhida.`;
}

export function resumoCompra(
  m: ModuloPreco,
  o: { hoje: DataCivil; dataFesta?: DataCivil | null },
): ResumoCompra {
  const valor = formatBRL(m.precoCentavos);
  if (m.cobranca === 'mensal') {
    const proxima = somarMeses(o.hoje, 1);
    return {
      agoraCentavos: m.precoCentavos,
      recorrenteCentavos: m.precoCentavos,
      primeiroVencimento: o.hoje,
      proximaCobranca: proxima,
      acessoAte: null,
      linhas: [
        { rotulo: 'Cobrado agora', texto: `${valor} (primeira mensalidade, vence hoje)` },
        { rotulo: 'Depois', texto: `${valor} por mês, a partir de ${dataBR(proxima)}` },
        {
          rotulo: 'Acesso',
          texto:
            'Começa quando o pagamento for confirmado pelo provedor, não ao voltar desta tela.',
        },
        { rotulo: 'Proporcional', texto: 'Não há: cada mensalidade cobre um mês inteiro.' },
        {
          rotulo: 'Cancelamento',
          texto:
            'Quando quiser, em Nossas soluções. O acesso continua até o fim do período pago e os dados ficam para consulta.',
        },
        {
          rotulo: 'Atraso',
          texto:
            m.carenciaDias > 0
              ? `O acesso continua por ${m.carenciaDias} dia(s) depois do vencimento sem pagamento.`
              : 'Sem pagamento, as operações do módulo param no fim do período pago; o histórico continua visível.',
        },
        {
          rotulo: 'Assinatura do sistema',
          texto: 'Não muda: o adicional é uma cobrança separada.',
        },
      ],
    };
  }
  const acessoAte =
    o.dataFesta && m.acessoEventoDias !== null ? somarDias(o.dataFesta, m.acessoEventoDias) : null;
  return {
    agoraCentavos: m.precoCentavos,
    recorrenteCentavos: null,
    primeiroVencimento: o.hoje,
    proximaCobranca: null,
    acessoAte,
    linhas: [
      { rotulo: 'Cobrado agora', texto: `${valor}, uma vez, para esta festa` },
      { rotulo: 'Depois', texto: 'Nenhuma cobrança recorrente.' },
      {
        rotulo: 'Acesso',
        texto: acessoAte
          ? `Da confirmação do pagamento até ${dataBR(acessoAte)}.`
          : 'Período de acesso ainda não definido.',
      },
      { rotulo: 'Vale para', texto: 'Somente a festa escolhida.' },
    ],
  };
}

/** "2026-11-02" → "02/11/2026" */
export const dataBR = (d: DataCivil): string =>
  `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

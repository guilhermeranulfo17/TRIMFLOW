import { compararDatas, somarDias, somarMeses } from '../dates';
import type { DataCivil, Parcela } from './tipos';

export type PlanoParcelas = { parcelas: Parcela[]; prazoCurto: boolean };

/**
 * Divide o saldo em até `parcelasMax` parcelas mensais. A última vence `prazoUltimaParcelaDias`
 * antes do evento; as demais, mês a mês para trás. Sem tempo para N parcelas (a primeira
 * cairia antes de hoje), reduz N. Se nem a última cabe, fica 1 parcela vencendo hoje.
 * Centavos inteiros; a diferença de arredondamento vai na primeira parcela.
 */
export function calcularParcelas(
  saldoCentavos: number,
  dataEvento: DataCivil,
  hoje: DataCivil,
  parcelasMax: number,
  prazoUltimaParcelaDias: number,
): PlanoParcelas {
  if (saldoCentavos <= 0) return { parcelas: [], prazoCurto: false };

  const ultima = somarDias(dataEvento, -prazoUltimaParcelaDias);
  if (compararDatas(ultima, hoje) < 0) {
    return {
      parcelas: [{ numero: 1, valorCentavos: saldoCentavos, vencimento: hoje }],
      prazoCurto: true,
    };
  }

  let n = Math.max(1, parcelasMax);
  while (n > 1 && compararDatas(somarMeses(ultima, -(n - 1)), hoje) < 0) n--;

  const base = Math.floor(saldoCentavos / n);
  const resto = saldoCentavos - base * n;
  const parcelas = Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    valorCentavos: base + (i === 0 ? resto : 0),
    vencimento: somarMeses(ultima, -(n - 1 - i)),
  }));
  return { parcelas, prazoCurto: false };
}

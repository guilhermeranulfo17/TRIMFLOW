import { formatInTimeZone } from 'date-fns-tz';
import { FUSO_PADRAO, type DataCivil } from '../dates';
import { noPeriodo } from './periodo';

/*
 * Contratos na tela de Números (Etapa 10, só o dono). ESPELHO de public.numeros_contratos; o
 * teste de equivalência compara as duas numa tabela de casos. Mudou uma, mude a outra.
 *  - enviados: contratos com enviado_em no período (data civil no fuso da empresa);
 *  - assinados: concluido_em no período;
 *  - tempo médio até assinar (minutos, arredondado): dos assinados no período.
 * Contrato de teste nunca conta.
 */

export type ContratoFato = {
  enviadoEm: Date | null;
  concluidoEm: Date | null;
  ehTeste: boolean;
};

export type MetricasContratos = {
  enviados: number;
  assinados: number;
  tempoMedioMin: number | null;
};

export function metricasContratos(
  fatos: ContratoFato[],
  p: { de: DataCivil; ate: DataCivil },
  fuso: string = FUSO_PADRAO,
): MetricasContratos {
  const dia = (d: Date) => formatInTimeZone(d, fuso, 'yyyy-MM-dd');
  const validos = fatos.filter((f) => !f.ehTeste && f.enviadoEm);
  const enviados = validos.filter((f) => noPeriodo(dia(f.enviadoEm!), p)).length;
  const assinados = validos.filter((f) => f.concluidoEm && noPeriodo(dia(f.concluidoEm), p));
  const tempos = assinados.map((f) => (f.concluidoEm!.getTime() - f.enviadoEm!.getTime()) / 60_000);
  // round() do Postgres em numeric: meio para longe do zero (tempos são sempre positivos aqui)
  const tempoMedioMin = tempos.length
    ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length)
    : null;
  return { enviados, assinados: assinados.length, tempoMedioMin };
}

/** "2 dias e 3 h", "5 h", "40 min" */
export function duracaoCurta(min: number): string {
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  const dias = Math.floor(h / 24);
  const resto = h % 24;
  return resto ? `${dias} dias e ${resto} h` : `${dias} dias`;
}

import { compararDatas, dataCivilValida, somarDias, type DataCivil } from '../dates';

/*
 * Período da tela de Números: sempre em DATAS CIVIS no fuso da empresa, inclusivo nas duas
 * pontas. O período anterior tem o mesmo número de dias e termina na véspera do atual.
 */

export const PERIODOS = [
  { chave: '7d', rotulo: '7 dias' },
  { chave: '30d', rotulo: '30 dias' },
  { chave: '90d', rotulo: '90 dias' },
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: 'mes_passado', rotulo: 'Mês passado' },
] as const;

export type ChavePeriodo = (typeof PERIODOS)[number]['chave'] | 'personalizado';

export type Periodo = { chave: ChavePeriodo; de: DataCivil; ate: DataCivil; rotulo: string };

/** Máximo de dias de um período personalizado. */
export const MAX_DIAS_PERIODO = 366;

/** Número de dias do período (inclusivo). */
export function diasDoPeriodo(p: { de: DataCivil; ate: DataCivil }): number {
  const [a, b] = [p.de, p.ate].map((d) =>
    Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)),
  );
  return Math.round((b! - a!) / 86_400_000) + 1;
}

const primeiroDoMes = (d: DataCivil) => `${d.slice(0, 7)}-01`;

/** Lê o período da URL (?periodo=30d ou ?de=&ate=). Valor inválido = 30 dias. */
export function resolverPeriodo(
  busca: { periodo?: string | null; de?: string | null; ate?: string | null },
  hoje: DataCivil,
): Periodo {
  const { de, ate } = busca;
  if (de && ate && dataCivilValida(de) && dataCivilValida(ate) && compararDatas(de, ate) <= 0) {
    const fim = compararDatas(ate, hoje) > 0 ? hoje : ate;
    if (compararDatas(de, fim) <= 0 && diasDoPeriodo({ de, ate: fim }) <= MAX_DIAS_PERIODO) {
      return { chave: 'personalizado', de, ate: fim, rotulo: 'Período escolhido' };
    }
  }
  const chave = PERIODOS.find((p) => p.chave === busca.periodo)?.chave ?? '30d';
  const rotulo = PERIODOS.find((p) => p.chave === chave)!.rotulo;
  switch (chave) {
    case '7d':
      return { chave, de: somarDias(hoje, -6), ate: hoje, rotulo };
    case '90d':
      return { chave, de: somarDias(hoje, -89), ate: hoje, rotulo };
    case 'mes':
      return { chave, de: primeiroDoMes(hoje), ate: hoje, rotulo };
    case 'mes_passado': {
      const fim = somarDias(primeiroDoMes(hoje), -1);
      return { chave, de: primeiroDoMes(fim), ate: fim, rotulo };
    }
    default:
      return { chave: '30d', de: somarDias(hoje, -29), ate: hoje, rotulo };
  }
}

/** Período anterior de mesmo tamanho, terminando na véspera do atual. */
export function periodoAnterior(p: { de: DataCivil; ate: DataCivil }): {
  de: DataCivil;
  ate: DataCivil;
} {
  const n = diasDoPeriodo(p);
  return { de: somarDias(p.de, -n), ate: somarDias(p.de, -1) };
}

/** A data civil está no período (inclusivo)? */
export function noPeriodo(dia: DataCivil, p: { de: DataCivil; ate: DataCivil }): boolean {
  return dia >= p.de && dia <= p.ate;
}

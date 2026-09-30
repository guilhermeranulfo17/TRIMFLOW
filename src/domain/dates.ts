import { formatInTimeZone } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';

/**
 * Datas: instantes são salvos em UTC e exibidos no fuso da empresa.
 * Datas civis (dia do evento, sem hora) circulam como "yyyy-MM-dd" e nunca sofrem conversão de fuso.
 */

export const FUSO_PADRAO = 'America/Sao_Paulo';

export type DataCivil = string; // "2026-11-14"

const REGEX_DATA_CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;

const DIAS_DA_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const;

function partesDataCivil(data: string): [number, number, number] | null {
  const m = REGEX_DATA_CIVIL.exec(data);
  if (!m) return null;
  const [, a, mes, d] = m;
  const ano = Number(a);
  const mesN = Number(mes);
  const dia = Number(d);
  const utc = new Date(Date.UTC(ano, mesN - 1, dia));
  if (utc.getUTCFullYear() !== ano || utc.getUTCMonth() !== mesN - 1 || utc.getUTCDate() !== dia) {
    return null;
  }
  return [ano, mesN, dia];
}

function paraDate(valor: Date | string): Date {
  if (typeof valor === 'string' && REGEX_DATA_CIVIL.test(valor)) {
    throw new RangeError(`Data inválida: ${valor}`);
  }
  const data = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(data.getTime())) throw new RangeError(`Data inválida: ${String(valor)}`);
  return data;
}

/** Data civil de hoje no fuso informado ("yyyy-MM-dd"). */
export function hojeNoFuso(fuso: string = FUSO_PADRAO, agora: Date = new Date()): DataCivil {
  return formatInTimeZone(agora, fuso, 'yyyy-MM-dd');
}

/**
 * Formata como "14/11/2026".
 * - Data civil ("2026-11-14"): formatada como está, sem fuso.
 * - Instante (Date ou ISO com hora): convertido para o fuso da empresa.
 */
export function formatData(valor: Date | string, fuso: string = FUSO_PADRAO): string {
  if (typeof valor === 'string') {
    const partes = partesDataCivil(valor);
    if (partes) {
      const [ano, mes, dia] = partes;
      return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
    }
  }
  return formatInTimeZone(paraDate(valor), fuso, 'dd/MM/yyyy');
}

/** Formata instante como "14/11/2026 18:30" no fuso da empresa. */
export function formatDataHora(valor: Date | string, fuso: string = FUSO_PADRAO): string {
  return formatInTimeZone(paraDate(valor), fuso, 'dd/MM/yyyy HH:mm');
}

/** "sábado", "segunda-feira"… Aceita data civil ou instante (convertido para o fuso). */
export function diaDaSemana(valor: Date | string, fuso: string = FUSO_PADRAO): string {
  if (typeof valor === 'string') {
    const partes = partesDataCivil(valor);
    if (partes) {
      const [ano, mes, dia] = partes;
      return DIAS_DA_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()]!;
    }
  }
  return formatInTimeZone(paraDate(valor), fuso, 'EEEE', { locale: ptBR });
}

// ---------------------------------------------------------------------------
// Aritmética de datas civis ("yyyy-MM-dd"), sem fuso e sem Date.now().
// ---------------------------------------------------------------------------

function exigirDataCivil(data: string): [number, number, number] {
  const partes = partesDataCivil(data);
  if (!partes) throw new RangeError(`Data inválida: ${data}`);
  return partes;
}

function paraDataCivil(utc: Date): DataCivil {
  const ano = utc.getUTCFullYear().toString().padStart(4, '0');
  const mes = (utc.getUTCMonth() + 1).toString().padStart(2, '0');
  const dia = utc.getUTCDate().toString().padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function dataCivilValida(data: string): boolean {
  return partesDataCivil(data) !== null;
}

/** Dia da semana de uma data civil: 0 = domingo … 6 = sábado. */
export function diaDaSemanaNumero(data: DataCivil): number {
  const [ano, mes, dia] = exigirDataCivil(data);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** somarDias("2026-11-14", 7) → "2026-11-21". Aceita negativos. */
export function somarDias(data: DataCivil, dias: number): DataCivil {
  const [ano, mes, dia] = exigirDataCivil(data);
  return paraDataCivil(new Date(Date.UTC(ano, mes - 1, dia + dias)));
}

/**
 * Soma meses mantendo o dia; se o mês de destino for mais curto, usa o último dia dele.
 * somarMeses("2026-03-31", -1) → "2026-02-28".
 */
export function somarMeses(data: DataCivil, meses: number): DataCivil {
  const [ano, mes, dia] = exigirDataCivil(data);
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return paraDataCivil(alvo);
}

/** Negativo se a < b, 0 se iguais, positivo se a > b. */
export function compararDatas(a: DataCivil, b: DataCivil): number {
  exigirDataCivil(a);
  exigirDataCivil(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

import { fromZonedTime } from 'date-fns-tz';
import { FUSO_PADRAO, hojeNoFuso, somarDias, type DataCivil } from '../dates';

/** Horário comercial padrão quando só o dia é informado ("amanhã", "em 3 dias"). */
export const HORA_PADRAO = '09:00';

/** Instante de uma data civil e hora ("HH:MM") no fuso da empresa. */
export function instanteLocal(data: DataCivil, hora: string, fuso: string = FUSO_PADRAO): Date {
  return fromZonedTime(`${data}T${hora}:00`, fuso);
}

export const OPCOES_ADIAR = [
  { chave: 'em_1_hora', rotulo: 'Em 1 hora' },
  { chave: 'amanha_9h', rotulo: 'Amanhã 9h' },
  { chave: 'em_3_dias', rotulo: 'Em 3 dias' },
  { chave: 'proxima_semana', rotulo: 'Próxima semana' },
] as const;

export type OpcaoAdiar = (typeof OPCOES_ADIAR)[number]['chave'];

/** Atalhos de adiar, sempre no fuso da empresa. */
export function quandoAdiar(opcao: OpcaoAdiar, agora: Date, fuso: string = FUSO_PADRAO): Date {
  const hoje = hojeNoFuso(fuso, agora);
  switch (opcao) {
    case 'em_1_hora':
      return new Date(agora.getTime() + 3_600_000);
    case 'amanha_9h':
      return instanteLocal(somarDias(hoje, 1), HORA_PADRAO, fuso);
    case 'em_3_dias':
      return instanteLocal(somarDias(hoje, 3), HORA_PADRAO, fuso);
    case 'proxima_semana':
      return instanteLocal(somarDias(hoje, 7), HORA_PADRAO, fuso);
  }
}

function hora(texto: string | undefined): string | null {
  if (!texto) return HORA_PADRAO;
  const m = /^(\d{1,2})(?:[h:](\d{2})?)?h?$/.exec(texto);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Interpreta o que o vendedor digitou: "amanhã", "amanhã 9h", "hoje 18h30", "em 3 dias",
 * "14/11", "14/11 15:00", "14/11/2026 15h" ou "2026-11-14T15:00" (campo de data e hora).
 * Sem hora, vale 9h. Devolve null se não entender ou se cair no passado.
 */
export function interpretarQuando(
  texto: string,
  agora: Date,
  fuso: string = FUSO_PADRAO,
): Date | null {
  const t = texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  if (!t) return null;
  const hoje = hojeNoFuso(fuso, agora);
  let data: DataCivil | null = null;
  let h: string | null = HORA_PADRAO;

  const iso = /^(\d{4}-\d{2}-\d{2})[t ](\d{2}:\d{2})$/.exec(t);
  const rel = /^(hoje|amanha|depois de amanha)(?: (?:as )?(\S+))?$/.exec(t);
  const emDias = /^em (\d{1,3}) dias?(?: (?:as )?(\S+))?$/.exec(t);
  const br = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?: (?:as )?(\S+))?$/.exec(t);
  if (iso) {
    data = iso[1]!;
    h = iso[2]!;
  } else if (rel) {
    data = somarDias(hoje, rel[1] === 'hoje' ? 0 : rel[1] === 'amanha' ? 1 : 2);
    h = hora(rel[2]);
  } else if (emDias) {
    data = somarDias(hoje, Number(emDias[1]));
    h = hora(emDias[2]);
  } else if (br) {
    const dia = Number(br[1]);
    const mes = Number(br[2]);
    let ano = br[3] ? Number(br[3]) : Number(hoje.slice(0, 4));
    const candidata = (a: number) =>
      `${a}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    // sem ano: a próxima ocorrência da data
    if (!br[3] && candidata(ano) < hoje) ano += 1;
    data = candidata(ano);
    h = hora(br[4]);
  }
  if (!data || !h || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(data)) return null;
  const instante = instanteLocal(data, h, fuso);
  if (Number.isNaN(instante.getTime()) || instante.getTime() <= agora.getTime()) return null;
  return instante;
}

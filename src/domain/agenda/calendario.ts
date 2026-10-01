import type { DataCivil } from '../dates';
import { diaDaSemanaNumero, somarDias } from '../dates';
import type { EstadoSlot } from './estado';

export type SlotDisponibilidade = {
  data: DataCivil;
  estado: EstadoSlot;
  vagas: number;
  capacidade: number;
};

/** Resumo do dia no calendário. */
export type ResumoDia = 'sem_turno' | 'livre' | 'parcial' | 'cheio' | 'bloqueado';

export type DiaCalendario = {
  data: DataCivil;
  /** false = dia de outro mês, só completa a semana */
  doMes: boolean;
  resumo: ResumoDia;
  contagem: Record<EstadoSlot, number>;
};

export type Calendario = { mes: string; semanas: DiaCalendario[][] };

const CONTAGEM_VAZIA = (): Record<EstadoSlot, number> => ({
  livre: 0,
  pre_reservado: 0,
  reservado: 0,
  bloqueado: 0,
  lotado: 0,
});

export function resumirDia(slots: SlotDisponibilidade[]): ResumoDia {
  if (slots.length === 0) return 'sem_turno';
  if (slots.every((s) => s.estado === 'bloqueado')) return 'bloqueado';
  if (slots.every((s) => s.vagas === 0)) return 'cheio';
  if (slots.every((s) => s.estado === 'livre' && s.vagas === s.capacidade)) return 'livre';
  return 'parcial';
}

/** Primeiro e último dia de um mês "yyyy-MM". */
export function limitesDoMes(mes: string): { de: DataCivil; ate: DataCivil } {
  const [ano, m] = mes.split('-').map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

/** Mês "yyyy-MM" somado de `delta` meses. */
export function somarMes(mes: string, delta: number): string {
  const [ano, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(ano, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Calendário mensal (semanas de domingo a sábado) com o resumo de cada dia a partir da
 * disponibilidade (uma linha por data × turno × espaço).
 */
export function montarCalendario(mes: string, disponibilidade: SlotDisponibilidade[]): Calendario {
  const { de, ate } = limitesDoMes(mes);
  const porDia = new Map<DataCivil, SlotDisponibilidade[]>();
  for (const s of disponibilidade) porDia.set(s.data, [...(porDia.get(s.data) ?? []), s]);

  const inicio = somarDias(de, -diaDaSemanaNumero(de));
  const fim = somarDias(ate, 6 - diaDaSemanaNumero(ate));
  const semanas: DiaCalendario[][] = [];
  for (let data = inicio; data <= fim; data = somarDias(data, 1)) {
    if (diaDaSemanaNumero(data) === 0) semanas.push([]);
    const slots = porDia.get(data) ?? [];
    const contagem = CONTAGEM_VAZIA();
    for (const s of slots) contagem[s.estado] += 1;
    semanas.at(-1)!.push({
      data,
      doMes: data >= de && data <= ate,
      resumo: resumirDia(slots),
      contagem,
    });
  }
  return { mes, semanas };
}

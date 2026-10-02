import { diaDaSemanaNumero, formatData, somarDias, somarMeses, type DataCivil } from '../dates';
import { razaoBp } from './mediana';

/*
 * Ocupação da agenda nos próximos meses e datas livres para promover. ESPELHO de
 * public.numeros_ocupacao (SQL), com teste de equivalência.
 *
 * Slot = (data, espaço ativo, turno ativo que existe naquele dia da semana), com a capacidade
 * do espaço (eventos simultâneos). Slot bloqueado sai da conta. Ocupado = reservas ativas
 * (confirmadas ou pré-reservas ainda não vencidas) no mesmo dia, espaço e turno, até a
 * capacidade. Aproximação documentada: não olha sobreposição de horário entre turnos.
 */

export type ConfigOcupacao = {
  espacos: { id: string; capacidade: number }[];
  turnos: { id: string; nome: string; diasSemana: number[]; ordem: number }[];
  bloqueios: { data: DataCivil; turnoId: string | null; espacoId: string | null }[];
  /** reservas que ocupam (confirmadas ativas e pré-reservas não vencidas) */
  reservas: { data: DataCivil; turnoId: string; espacoId: string }[];
};

export type Contagem = { disponiveis: number; reservados: number; bp: number | null };

export type Ocupacao = {
  de: DataCivil;
  ate: DataCivil;
  total: Contagem;
  porMes: ({ mes: string } & Contagem)[];
  /** dia da semana (0 = domingo) × turno */
  porDiaTurno: ({ dia: number; turnoId: string } & Contagem)[];
};

type Slot = { data: DataCivil; turnoId: string; capacidade: number; reservados: number };

function slotsDoPeriodo(cfg: ConfigOcupacao, de: DataCivil, ate: DataCivil): Slot[] {
  const chave = (d: string, t: string, e: string) => `${d}|${t}|${e}`;
  const ocupados = new Map<string, number>();
  for (const r of cfg.reservas) {
    const k = chave(r.data, r.turnoId, r.espacoId);
    ocupados.set(k, (ocupados.get(k) ?? 0) + 1);
  }
  const bloqueado = (d: string, t: string, e: string) =>
    cfg.bloqueios.some(
      (b) =>
        b.data === d &&
        (b.turnoId === null || b.turnoId === t) &&
        (b.espacoId === null || b.espacoId === e),
    );
  const slots: Slot[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    const dia = diaDaSemanaNumero(d);
    for (const t of cfg.turnos) {
      if (!t.diasSemana.includes(dia)) continue;
      for (const e of cfg.espacos) {
        if (bloqueado(d, t.id, e.id)) continue;
        const reservados = Math.min(e.capacidade, ocupados.get(chave(d, t.id, e.id)) ?? 0);
        slots.push({ data: d, turnoId: t.id, capacidade: e.capacidade, reservados });
      }
    }
  }
  return slots;
}

const somar = (ss: Slot[]): Contagem => {
  const disponiveis = ss.reduce((s, x) => s + x.capacidade, 0);
  const reservados = ss.reduce((s, x) => s + x.reservados, 0);
  return { disponiveis, reservados, bp: razaoBp(reservados, disponiveis) };
};

/** Próximos `meses` meses a partir de hoje (inclusive), até a véspera de hoje + meses. */
export function calcularOcupacao(cfg: ConfigOcupacao, hoje: DataCivil, meses = 3): Ocupacao {
  const ate = somarDias(somarMeses(hoje, meses), -1);
  const slots = slotsDoPeriodo(cfg, hoje, ate);
  const porMes = new Map<string, Slot[]>();
  const porDiaTurno = new Map<string, Slot[]>();
  for (const s of slots) {
    const m = s.data.slice(0, 7);
    porMes.set(m, [...(porMes.get(m) ?? []), s]);
    const k = `${diaDaSemanaNumero(s.data)}|${s.turnoId}`;
    porDiaTurno.set(k, [...(porDiaTurno.get(k) ?? []), s]);
  }
  return {
    de: hoje,
    ate,
    total: somar(slots),
    porMes: [...porMes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, ss]) => ({ mes, ...somar(ss) })),
    porDiaTurno: [...porDiaTurno.entries()]
      .map(([k, ss]) => {
        const [dia, turnoId] = k.split('|');
        return { dia: Number(dia), turnoId: turnoId!, ...somar(ss) };
      })
      .sort((a, b) => a.dia - b.dia || a.turnoId.localeCompare(b.turnoId)),
  };
}

export type DataLivre = { data: DataCivil; turnoIds: string[] };

/**
 * Fins de semana (sábado e domingo) dos próximos `dias` dias, a partir de `inicio` (hoje +
 * antecedência mínima), com pelo menos um turno com vaga. Turnos na ordem cadastrada.
 */
export function datasLivres(cfg: ConfigOcupacao, inicio: DataCivil, ate: DataCivil): DataLivre[] {
  const ordem = new Map(cfg.turnos.map((t) => [t.id, t.ordem]));
  const porData = new Map<DataCivil, Set<string>>();
  for (const s of slotsDoPeriodo(cfg, inicio, ate)) {
    const dia = diaDaSemanaNumero(s.data);
    if (dia !== 0 && dia !== 6) continue;
    if (s.reservados >= s.capacidade) continue;
    porData.set(s.data, (porData.get(s.data) ?? new Set()).add(s.turnoId));
  }
  return [...porData.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, ids]) => ({
      data,
      turnoIds: [...ids].sort(
        (a, b) => (ordem.get(a) ?? 0) - (ordem.get(b) ?? 0) || a.localeCompare(b),
      ),
    }));
}

const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "à tarde", "à noite", "de manhã", "no almoço"; outro nome: "no turno Brunch". */
export function turnoNaFrase(nome: string): string {
  const n = nome.trim().toLowerCase();
  if (n.startsWith('manh')) return 'de manhã';
  if (n.startsWith('tarde')) return 'à tarde';
  if (n.startsWith('noite')) return 'à noite';
  if (n.startsWith('almo')) return 'no almoço';
  if (n.startsWith('jantar')) return 'no jantar';
  return `no turno ${nome.trim()}`;
}

const juntar = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}`;

/** "Ainda temos o sábado 14/11 à tarde livre! Monte seu orçamento e garanta a data: {link}" */
export function textoPromocao(o: {
  data: DataCivil;
  turnos: string[];
  buffet: string;
  link: string;
}): string {
  const dia = NOME_DIA[diaDaSemanaNumero(o.data)]!;
  const artigo = dia === 'sábado' || dia === 'domingo' ? 'o' : 'a';
  const quando = o.turnos.length ? ` ${juntar(o.turnos.map(turnoNaFrase))}` : '';
  return (
    `Ainda temos ${artigo} ${dia} ${formatData(o.data).slice(0, 5)}${quando} livre no ${o.buffet.trim()}! ` +
    `Monte seu orçamento em 2 minutos e garanta a data: ${o.link}`
  );
}

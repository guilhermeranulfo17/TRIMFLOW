import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { estadoDoSlot, intervaloDoSlot, type Ocupacao } from '@/domain/agenda';
import { conectar, emTransacao, IDS } from '../support/db';

/*
 * A regra de conflito do domínio (src/domain/agenda) e a do banco (_disponibilidade) precisam
 * dar o mesmo resultado. Cada caso monta um cenário, pede a disponibilidade ao banco e recalcula
 * cada slot no domínio com os mesmos dados.
 */

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;

type Caso = {
  nome: string;
  capacidade?: number;
  intervalo: number;
  turnos: { nome: string; hora: string; duracao: number }[];
  reservas?: {
    turno: string;
    dia?: number;
    tipo?: 'pre_reserva' | 'confirmada';
    status?: 'ativa' | 'cancelada' | 'vencida';
    /** minutos a partir de agora; negativo = vencida sem o job */
    expira?: number;
  }[];
  bloqueios?: { dia?: number; turno?: string | null; espaco?: 'este' | 'outro' | null }[];
};

const TARDE = { nome: 'Tarde', hora: '15:00', duracao: 240 };
const NOITE = { nome: 'Noite', hora: '20:00', duracao: 240 };

const CASOS: Caso[] = [
  { nome: 'vazio', intervalo: 60, turnos: [TARDE, NOITE] },
  { nome: 'confirmada', intervalo: 60, turnos: [TARDE, NOITE], reservas: [{ turno: 'Tarde' }] },
  {
    nome: 'pré-reserva ativa',
    intervalo: 60,
    turnos: [TARDE],
    reservas: [{ turno: 'Tarde', tipo: 'pre_reserva', expira: 600 }],
  },
  {
    nome: 'pré-reserva vencida sem job',
    intervalo: 60,
    turnos: [TARDE],
    reservas: [{ turno: 'Tarde', tipo: 'pre_reserva', expira: -5 }],
  },
  {
    nome: 'cancelada',
    intervalo: 60,
    turnos: [TARDE],
    reservas: [{ turno: 'Tarde', status: 'cancelada' }],
  },
  {
    nome: 'turnos sobrepostos',
    intervalo: 0,
    turnos: [TARDE, { nome: 'Fim de tarde', hora: '18:00', duracao: 180 }],
    reservas: [{ turno: 'Fim de tarde' }],
  },
  {
    nome: 'colados com intervalo 60',
    intervalo: 60,
    turnos: [TARDE, { nome: 'Colado', hora: '19:00', duracao: 120 }],
    reservas: [{ turno: 'Colado' }],
  },
  {
    nome: 'colados sem intervalo',
    intervalo: 0,
    turnos: [TARDE, { nome: 'Colado', hora: '19:00', duracao: 120 }],
    reservas: [{ turno: 'Colado' }],
  },
  {
    nome: 'meia-noite invade o dia seguinte',
    intervalo: 60,
    turnos: [
      { nome: 'Madrugada', hora: '22:00', duracao: 300 },
      { nome: 'Cedo', hora: '03:30', duracao: 120 },
    ],
    reservas: [{ turno: 'Madrugada', dia: 0 }],
  },
  {
    nome: 'capacidade 2 com um evento',
    capacidade: 2,
    intervalo: 60,
    turnos: [TARDE],
    reservas: [{ turno: 'Tarde' }],
  },
  {
    nome: 'capacidade 2 lotada',
    capacidade: 2,
    intervalo: 60,
    turnos: [TARDE],
    reservas: [{ turno: 'Tarde' }, { turno: 'Tarde', tipo: 'pre_reserva', expira: 60 }],
  },
  {
    nome: 'bloqueios',
    intervalo: 60,
    turnos: [TARDE, NOITE],
    bloqueios: [
      { dia: 0, turno: null, espaco: null },
      { dia: 1, turno: 'Noite', espaco: 'este' },
      { dia: 1, turno: 'Tarde', espaco: 'outro' },
    ],
  },
];

async function montar(tx: Tx, caso: Caso) {
  await tx`update public.regras_comerciais set intervalo_entre_eventos_min = ${caso.intervalo}
    where empresa_id = ${IDS.empresaA}`;
  const [espaco] =
    await tx`insert into public.espacos (empresa_id, nome, capacidade_max, eventos_simultaneos)
    values (${IDS.empresaA}, 'Equivalência', 100, ${caso.capacidade ?? 1}) returning id`;
  const [outro] = await tx`insert into public.espacos (empresa_id, nome, capacidade_max, ativo)
    values (${IDS.empresaA}, 'Outro (inativo)', 100, false) returning id`;
  const turnos: Record<string, { id: string; hora: string; duracao: number }> = {};
  for (const t of caso.turnos) {
    const [l] =
      await tx`insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana)
      values (${IDS.empresaA}, ${t.nome}, ${t.hora}, ${t.duracao}, '{0,1,2,3,4,5,6}') returning id`;
    turnos[t.nome] = { id: l!.id as string, hora: t.hora, duracao: t.duracao };
  }
  const [base] = await tx`select (current_date + 200)::text as d`;
  const dia = async (n = 0) =>
    (await tx`select (${base!.d}::date + ${n}::int)::text as d`)[0]!.d as string;

  for (const r of caso.reservas ?? []) {
    const t = turnos[r.turno]!;
    const data = await dia(r.dia);
    const tipo = r.tipo ?? 'confirmada';
    await tx`insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, expira_em, cliente_nome)
      select ${IDS.empresaA}, ${espaco!.id}, ${t.id}, ${data}::date, i.inicio, i.fim,
             ${tipo}::public.tipo_reserva, ${r.status ?? 'ativa'}::public.status_reserva,
             case when ${tipo} = 'pre_reserva' then now() + make_interval(mins => ${r.expira ?? 60}) end,
             'Cliente'
      from public._agenda_intervalo(${data}::date, ${t.hora}::time, ${t.duracao}, 'America/Sao_Paulo', ${caso.intervalo}) i`;
  }
  for (const b of caso.bloqueios ?? []) {
    const espacoId = b.espaco === 'este' ? espaco!.id : b.espaco === 'outro' ? outro!.id : null;
    const turnoId = b.turno ? turnos[b.turno]!.id : null;
    await tx`insert into public.bloqueios (empresa_id, data, turno_id, espaco_id)
      values (${IDS.empresaA}, ${await dia(b.dia)}::date, ${turnoId}, ${espacoId})`;
  }
  return { espaco: espaco!.id as string, turnos, de: await dia(0), ate: await dia(1) };
}

describe('equivalência domínio × SQL', () => {
  it.each(CASOS.map((c) => [c.nome, c] as const))('%s', async (_nome, caso) => {
    await emTransacao(sql, async (tx) => {
      const m = await montar(tx, caso);
      const [agoraLinha] = await tx`select now() as agora`;
      const agora = agoraLinha!.agora as Date;
      const todas =
        await tx`select * from public._disponibilidade(${IDS.empresaA}, ${m.de}::date, ${m.ate}::date, ${m.espaco})`;
      const turnoIds = new Set(Object.values(m.turnos).map((t) => t.id));
      const linhas = todas.filter((l) => turnoIds.has(l.turno_id));
      const reservas = await tx`select * from public.reservas where espaco_id = ${m.espaco}`;
      const bloqueios =
        await tx`select data::text as data, turno_id, espaco_id from public.bloqueios
        where empresa_id = ${IDS.empresaA} and data between ${m.de}::date and ${m.ate}::date`;
      const ocupacoes: Ocupacao[] = reservas.map((r) => ({
        espacoId: r.espaco_id,
        tipo: r.tipo,
        status: r.status,
        expiraEm: r.expira_em,
        inicio: r.inicio,
        fim: r.fim,
      }));
      const turnoPorId = Object.fromEntries(Object.values(m.turnos).map((t) => [t.id, t]));

      expect(linhas.length).toBeGreaterThan(0);
      for (const l of linhas) {
        const t = turnoPorId[l.turno_id]!;
        const data = (l.data as Date).toISOString().slice(0, 10);
        const intervalo = intervaloDoSlot(
          data,
          { horaInicio: t.hora, duracaoMin: t.duracao },
          'America/Sao_Paulo',
          caso.intervalo,
        );
        const [sqlIntervalo] =
          await tx`select * from public._agenda_intervalo(${data}::date, ${t.hora}::time, ${t.duracao}, 'America/Sao_Paulo', ${caso.intervalo})`;
        expect(intervalo.inicio.getTime()).toBe((sqlIntervalo!.inicio as Date).getTime());
        expect(intervalo.fim.getTime()).toBe((sqlIntervalo!.fim as Date).getTime());

        const dominio = estadoDoSlot(
          { data, turnoId: l.turno_id, espacoId: l.espaco_id, ...intervalo },
          ocupacoes,
          bloqueios.map((b) => ({ data: b.data, turnoId: b.turno_id, espacoId: b.espaco_id })),
          l.capacidade,
          agora,
        );
        expect({ data, turno: t.hora, estado: l.estado, vagas: l.vagas }).toEqual({
          data,
          turno: t.hora,
          estado: dominio.estado,
          vagas: dominio.vagas,
        });
      }
    });
  });
});

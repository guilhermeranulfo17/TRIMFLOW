import { afterAll, describe, expect, it } from 'vitest';
import { temperaturaPorAberturas } from '@/domain/proposta';
import { grupoDoLead, limitesDoDia, ordemNoGrupo, temperaturaPorInatividade } from '@/domain/leads';
import {
  EVENTOS_LEAD,
  STATUS_LEAD,
  statusAoReabrir,
  TEMPERATURAS,
  transicaoLead,
} from '@/domain/publico';
import { conectar } from '../support/db';

/*
 * A regra de status do lead existe no SQL (public._lead_transicao) e no domínio
 * (transicaoLead). Este teste compara as duas em TODAS as combinações.
 */
const sql = conectar();
afterAll(() => sql.end());

describe('equivalência do status do lead: domínio × SQL', () => {
  it('todas as combinações de status × temperatura × evento', async () => {
    const linhas = await sql`
      select s::text as status, t::text as temperatura, e as evento,
             (public._lead_transicao(s, t, e)).status::text as novo_status,
             (public._lead_transicao(s, t, e)).temperatura::text as nova_temperatura
      from unnest(${STATUS_LEAD}::public.status_lead[]) s
      cross join unnest(${TEMPERATURAS}::public.temperatura_lead[]) t
      cross join unnest(${EVENTOS_LEAD}::text[]) e`;
    expect(linhas).toHaveLength(STATUS_LEAD.length * TEMPERATURAS.length * EVENTOS_LEAD.length);
    for (const l of linhas) {
      const dominio = transicaoLead({ status: l.status, temperatura: l.temperatura }, l.evento);
      expect({ ...l, ...dominio }).toEqual({
        ...l,
        status: l.novo_status,
        temperatura: l.nova_temperatura,
      });
    }
  });
});

describe('equivalência da temperatura por aberturas: domínio × SQL', () => {
  it('casos com aberturas dentro e fora da janela de 3 dias', async () => {
    const agora = new Date('2026-10-01T12:00:00Z');
    const h = (horas: number) => new Date(agora.getTime() - horas * 3_600_000);
    const casos: Date[][] = [
      [],
      [h(1)],
      [h(1), h(2)],
      [h(1), h(71)],
      [h(1), h(73)],
      [h(80), h(90)],
      [h(0), h(72)],
    ];
    for (const instantes of casos) {
      for (const atual of TEMPERATURAS) {
        const [r] = await sql`select public._temperatura_aberturas(
          ${instantes.map((i) => i.toISOString())}::timestamptz[], ${agora.toISOString()}::timestamptz,
          ${atual}::public.temperatura_lead)::text as t`;
        expect({ instantes: instantes.length, atual, t: r!.t }).toEqual({
          instantes: instantes.length,
          atual,
          t: temperaturaPorAberturas(instantes, agora, atual),
        });
      }
    }
  });
});

describe('equivalência da Etapa 6: domínio × SQL', () => {
  it('reabrir um perdido', async () => {
    for (const antes of STATUS_LEAD) {
      const [r] =
        await sql`select public._lead_status_reaberto(${antes}::public.status_lead)::text as s`;
      expect({ antes, s: r!.s }).toEqual({ antes, s: statusAoReabrir(antes) });
    }
  });

  it('temperatura por inatividade (7 dias)', async () => {
    const agora = new Date('2026-10-02T13:00:00Z');
    for (const status of STATUS_LEAD) {
      for (const atual of TEMPERATURAS) {
        for (const horas of [0, 24, 167, 168, 169, 400]) {
          const ultima = new Date(agora.getTime() - horas * 3_600_000);
          const [r] = await sql`select public._temperatura_inatividade(
            ${status}::public.status_lead, ${atual}::public.temperatura_lead,
            ${ultima.toISOString()}::timestamptz, ${agora.toISOString()}::timestamptz)::text as t`;
          expect({ status, atual, horas, t: r!.t }).toEqual({
            status,
            atual,
            horas,
            t: temperaturaPorInatividade(status, atual, ultima, agora),
          });
        }
      }
    }
  });

  it('grupo e ordem da caixa em todas as combinações de sinais', async () => {
    const agora = new Date('2026-10-02T13:00:00Z');
    const limites = limitesDoDia(agora, 'America/Sao_Paulo');
    const h = (x: number | null) => (x === null ? null : new Date(agora.getTime() + x * 3_600_000));
    let casos = 0;
    for (const status of STATUS_LEAD) {
      for (const temperatura of TEMPERATURAS) {
        for (const pre of [null, -1, 5]) {
          for (const [visitaPedida, visitaProxima] of [
            [false, null],
            [true, null],
            [false, 20],
            [false, 60],
          ] as const) {
            for (const tarefa of [null, -2, 6, 30]) {
              for (const [primeiro, proximo] of [
                [null, null],
                [-10, -1],
                [-10, 4],
              ] as const) {
                const e = {
                  status,
                  temperatura,
                  preReservaExpiraEm: h(pre),
                  visitaPedida,
                  visitaPedidaEm: visitaPedida ? h(-30) : null,
                  visitaProxima: h(visitaProxima),
                  tarefaVence: h(tarefa),
                  primeiroContatoEm: h(primeiro),
                  proximoContatoEm: h(proximo),
                  criadoEm: h(-100)!,
                  ultimaAtividadeEm: h(-7)!,
                };
                const [r] = await sql`select g, public._lead_ordem(g,
                    ${e.preReservaExpiraEm}::timestamptz,
                    coalesce(${e.visitaPedidaEm}::timestamptz, ${e.visitaProxima}::timestamptz),
                    ${e.tarefaVence}::timestamptz, ${e.proximoContatoEm}::timestamptz,
                    ${e.criadoEm}::timestamptz, ${e.ultimaAtividadeEm}::timestamptz) as o
                  from public._lead_grupo(${status}::public.status_lead,
                    ${temperatura}::public.temperatura_lead, ${e.preReservaExpiraEm}::timestamptz,
                    ${visitaPedida}, ${e.visitaProxima}::timestamptz, ${e.tarefaVence}::timestamptz,
                    ${e.primeiroContatoEm}::timestamptz, ${e.proximoContatoEm}::timestamptz,
                    ${agora}::timestamptz, ${limites.fimHoje}::timestamptz,
                    ${limites.fimAmanha}::timestamptz) as g`;
                const g = grupoDoLead(e, agora, limites);
                expect({
                  status,
                  temperatura,
                  pre,
                  visitaPedida,
                  visitaProxima,
                  tarefa,
                  g: r!.g,
                }).toEqual({
                  status,
                  temperatura,
                  pre,
                  visitaPedida,
                  visitaProxima,
                  tarefa,
                  g,
                });
                expect(Number(r!.o)).toBeCloseTo(ordemNoGrupo(g, e), 3);
                casos++;
              }
            }
          }
        }
      }
    }
    expect(casos).toBeGreaterThan(1000);
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { temperaturaPorAberturas } from '@/domain/proposta';
import { EVENTOS_LEAD, STATUS_LEAD, TEMPERATURAS, transicaoLead } from '@/domain/publico';
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

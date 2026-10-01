import { afterAll, describe, expect, it } from 'vitest';
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

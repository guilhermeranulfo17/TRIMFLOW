import { afterAll, describe, expect, it } from 'vitest';
import { etapaDoFunil, STATUS_ORCAMENTO } from '@/domain/leads/funil';
import { STATUS_LEAD } from '@/domain/publico/status-lead';
import { conectar, emTransacao, IDS, assumirUsuario } from '../support/db';

/*
 * Etapa 13: o funil de leads. A etapa existe no SQL (public._funil_etapa) e no domínio
 * (etapaDoFunil), comparadas em todas as combinações. public.funil_leads respeita o RLS, deixa
 * de fora lead de teste e realizado, limita os cards por etapa e soma as propostas.
 */
const sql = conectar();
afterAll(() => sql.end());

describe('equivalência da etapa do funil: domínio × SQL', () => {
  it('todos os status do lead × status do orçamento (e sem orçamento)', async () => {
    const linhas = await sql`
      select s::text as status, o::text as orcamento, public._funil_etapa(s, o) as etapa
      from unnest(${STATUS_LEAD}::public.status_lead[]) s
      cross join (select unnest(${STATUS_ORCAMENTO}::public.status_orcamento[]) as o
                  union all select null) os`;
    expect(linhas).toHaveLength(STATUS_LEAD.length * (STATUS_ORCAMENTO.length + 1));
    for (const l of linhas) {
      expect({ ...l, etapa: etapaDoFunil(l.status, l.orcamento) }).toEqual(l);
    }
  });
});

describe('public.funil_leads', () => {
  it('cada buffet vê só os próprios leads; teste e realizado ficam de fora', async () => {
    await emTransacao(sql, async (tx) => {
      const [teste] = await tx`insert into public.leads (empresa_id, nome, whatsapp_e164, eh_teste)
        values (${IDS.empresaA}, 'Funil Teste', '+5534990001301', true) returning id`;
      const [realizado] =
        await tx`insert into public.leads (empresa_id, nome, whatsapp_e164, status)
        values (${IDS.empresaA}, 'Funil Realizado', '+5534990001302', 'realizado') returning id`;
      await assumirUsuario(tx, IDS.donoA);
      const a = await tx`select id, etapa from public.funil_leads('{}'::jsonb, 100)`;
      const ids = a.map((r) => r.id);
      expect(ids).not.toContain(teste!.id);
      expect(ids).not.toContain(realizado!.id);
      expect(a.every((r) => r.etapa !== null)).toBe(true);
      const comTeste = await tx`select id from public.funil_leads('{"teste": true}'::jsonb, 100)`;
      expect(comTeste.map((r) => r.id)).toContain(teste!.id);

      await tx`reset role`;
      await assumirUsuario(tx, IDS.donoB);
      const b = await tx`select id from public.funil_leads('{}'::jsonb, 100)`;
      expect(b.some((r) => ids.includes(r.id))).toBe(false);
    });
  });

  it('limite por etapa, total e soma das propostas de cada etapa', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      const todos = await tx`select etapa, etapa_total, etapa_soma_centavos, total_centavos
        from public.funil_leads('{}'::jsonb, 100)`;
      const um = await tx`select etapa, etapa_total from public.funil_leads('{}'::jsonb, 1)`;
      const etapas = [...new Set(todos.map((r) => r.etapa))];
      expect(um).toHaveLength(etapas.length);
      for (const e of etapas) {
        const da = todos.filter((r) => r.etapa === e);
        expect(um.find((r) => r.etapa === e)!.etapa_total).toBe(da.length);
        const soma = da.reduce((s, r) => s + (r.total_centavos ?? 0), 0);
        expect(Number(da[0]!.etapa_soma_centavos)).toBe(soma);
      }
    });
  });

  it('vendedor vê o mesmo funil (como a caixa); filtro "meus" restringe', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.vendedorA);
      const todos = await tx`select id from public.funil_leads('{}'::jsonb, 100)`;
      const meus = await tx`select id, responsavel_id
        from public.funil_leads('{"responsavel": "meus"}'::jsonb, 100)`;
      expect(todos.length).toBeGreaterThan(0);
      expect(meus.every((r) => r.responsavel_id === IDS.vendedorA)).toBe(true);
    });
  });
});

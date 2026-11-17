import { afterAll, describe, expect, it } from 'vitest';
import { sinalPendente, type EntradaSinal } from '@/domain/financeiro/sinal';
import { assumirUsuario, conectar, emTransacao, IDS } from '../support/db';
import { cenarioPublico, dataDaqui } from '../support/publico';

/*
 * Item 5 da análise de 17/11/2026 (§99): confirmar sem sinal continua permitido, e o dono vê o
 * "sinal pendente" na Agenda e no resumo diário. _sinal_pendente = domain/financeiro/sinal.
 */

const sql = conectar();
afterAll(() => sql.end());

describe('sinal pendente (item 5)', () => {
  it('_sinal_pendente = sinalPendente (tabela de casos)', async () => {
    const tipos = ['pre_reserva', 'confirmada'] as const;
    const status = ['ativa', 'vencida', 'cancelada', 'realizada'] as const;
    const sinais = [null, 0, 1, 50_000];
    const recebidos = [0, 1, 20_000];
    const datas = ['2026-11-16', '2026-11-17', '2026-12-20'];
    const casos: EntradaSinal[] = [];
    for (const tipo of tipos)
      for (const st of status)
        for (const sinal of sinais)
          for (const recebido of recebidos)
            for (const temPlano of [false, true])
              for (const data of datas)
                casos.push({
                  tipo,
                  status: st,
                  sinalCentavos: sinal,
                  recebidoCentavos: recebido,
                  temPlano,
                  data,
                  hoje: '2026-11-17',
                });
    const linhas = await sql`select public._sinal_pendente(c ->> 'tipo', c ->> 'status',
        (c ->> 'sinal')::int, (c ->> 'recebido')::int, (c ->> 'plano')::boolean,
        (c ->> 'data')::date, (c ->> 'hoje')::date) as r
      from jsonb_array_elements(${sql.json(
        casos.map((c) => ({
          tipo: c.tipo,
          status: c.status,
          sinal: c.sinalCentavos,
          recebido: c.recebidoCentavos,
          plano: c.temPlano,
          data: c.data,
          hoje: c.hoje,
        })) as never,
      )}) with ordinality as x(c, n)
      order by x.n`;
    expect(linhas.map((l) => l.r)).toEqual(casos.map(sinalPendente));
    expect(casos.filter(sinalPendente).length).toBeGreaterThan(0);
  });

  it('confirmar sem sinal é permitido e entra no resumo diário só do dono', async () => {
    await emTransacao(sql, async (tx) => {
      // fuso em que agora são entre 9h e 20h (o resumo só sai a partir das 8h)
      const [z] = await tx`select z from (
          select 'Etc/GMT' || case when o > 0 then '-' || o when o < 0 then '+' || (-o) else '' end as z
          from generate_series(-12, 14) o) x
        where extract(hour from now() at time zone z) between 9 and 20 limit 1`;
      await tx`update public.empresas set fuso = ${z!.z as string} where id = ${IDS.empresaA}`;
      await tx`delete from public.avisos where empresa_id = ${IDS.empresaA} and tipo = 'resumo_diario'`;
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 60);
      await assumirUsuario(tx, IDS.donoA);
      await tx`select public.criar_reserva(${c.espaco}, ${c.turno}, ${data}::date, 'confirmada', 'Sem Sinal')`;
      await tx`reset role`;
      await tx`select public.gerar_avisos_tempo()`;
      const resumos = await tx`select usuario_id, dados from public.avisos
        where empresa_id = ${IDS.empresaA} and tipo = 'resumo_diario'`;
      const dono = resumos.find((r) => r.usuario_id === IDS.donoA);
      expect(Number(dono!.dados.sinal_pendente)).toBeGreaterThanOrEqual(1);
      const vendedor = resumos.find((r) => r.usuario_id === IDS.vendedorA);
      if (vendedor) expect(Number(vendedor.dados.sinal_pendente)).toBe(0);
    });
  });
});

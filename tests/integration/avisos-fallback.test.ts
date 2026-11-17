import { afterAll, describe, expect, it } from 'vitest';
import { conectar, emTransacao, IDS } from '../support/db';

/*
 * Item 2 da análise de 17/11/2026 (§99): pagamento_falhou, conta_suspensa e pre_reserva_vencendo
 * caem para o e-mail quando push e WhatsApp não saem; o "ignorado" fica com o motivo e aparece no
 * diagnóstico do /interno. Nada é enviado de verdade: só a fila do banco.
 */

const sql = conectar();
afterAll(() => sql.end());

type Tx = Parameters<Parameters<typeof emTransacao>[1]>[0];

async function leadDe(tx: Tx, posicao = 0) {
  const [l] = await tx`select id from public.leads where empresa_id = ${IDS.empresaA}
    and not eh_teste order by criado_em, id offset ${posicao} limit 1`;
  return l!.id as string;
}

const entregas = (tx: Tx, aviso: string) =>
  tx`select canal::text, status::text, erro_codigo from public.avisos_entregas
    where aviso_id = ${aviso} order by canal`;

async function criar(tx: Tx, tipo: string, lead: string | null, chave: string) {
  const [a] = await tx`select public._aviso_criar(${IDS.empresaA}, ${IDS.donoA},
    ${tipo}::public.tipo_aviso, ${lead}, '{}'::jsonb, ${chave}, false) as id`;
  return a!.id as string;
}

describe('e-mail de reserva dos avisos críticos (item 2)', () => {
  it('sem push nem WhatsApp, pre_reserva_vencendo entra na fila do e-mail', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`delete from public.push_inscricoes where usuario_id = ${IDS.donoA}`;
      await tx`update public.preferencias_avisos set whatsapp_ativo = false where usuario_id = ${IDS.donoA}`;
      const id = await criar(tx, 'pre_reserva_vencendo', await leadDe(tx), 'fallback:1');
      expect(await entregas(tx, id)).toEqual([
        { canal: 'email', status: 'pendente', erro_codigo: null },
      ]);
    });
  });

  it('aviso que não é crítico continua só no painel', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`delete from public.push_inscricoes where usuario_id = ${IDS.donoA}`;
      await tx`update public.preferencias_avisos set whatsapp_ativo = false where usuario_id = ${IDS.donoA}`;
      const id = await criar(tx, 'visita_pedida', await leadDe(tx), 'fallback:2');
      expect(await entregas(tx, id)).toEqual([]);
    });
  });

  it('push e WhatsApp ignorados (canal desligado): o e-mail entra; push enviado: não', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`delete from public.push_inscricoes where usuario_id = ${IDS.donoA}`;
      await tx`insert into public.push_inscricoes (empresa_id, usuario_id, endpoint, p256dh, auth)
        values (${IDS.empresaA}, ${IDS.donoA}, 'https://push.exemplo/fallback', 'chave-p256dh-teste', 'auth-teste')`;
      await tx`insert into public.preferencias_avisos
          (empresa_id, usuario_id, whatsapp_ativo, whatsapp_numero, whatsapp_aceite_em)
        values (${IDS.empresaA}, ${IDS.donoA}, true, '+5534990000001', now())
        on conflict (usuario_id) do update set whatsapp_ativo = true,
          whatsapp_numero = '+5534990000001', whatsapp_aceite_em = now()`;
      const lead = await leadDe(tx);
      const id = await criar(tx, 'pre_reserva_vencendo', lead, 'fallback:3');
      const antes = await entregas(tx, id);
      expect(antes.map((e) => e.canal)).toEqual(['push', 'whatsapp']);

      const [w] =
        await tx`select id from public.avisos_entregas where aviso_id = ${id} and canal = 'whatsapp'`;
      await tx`select public.concluir_entrega(${w!.id}, 'ignorado', 'CANAL_DESLIGADO')`;
      // push ainda pendente: espera
      expect((await entregas(tx, id)).some((e) => e.canal === 'email')).toBe(false);
      const [p] =
        await tx`select id from public.avisos_entregas where aviso_id = ${id} and canal = 'push'`;
      await tx`update public.avisos_entregas set tentativas = 5 where id = ${p!.id}`;
      await tx`select public.concluir_entrega(${p!.id}, 'erro', 'PUSH_500')`;
      expect(await entregas(tx, id)).toEqual([
        { canal: 'email', status: 'pendente', erro_codigo: null },
        { canal: 'push', status: 'falhou', erro_codigo: 'PUSH_500' },
        { canal: 'whatsapp', status: 'ignorado', erro_codigo: 'CANAL_DESLIGADO' },
      ]);

      // outro lead (o mesmo lead em 10 minutos agrupa no mesmo aviso)
      const id2 = await criar(tx, 'pre_reserva_vencendo', await leadDe(tx, 1), 'fallback:4');
      const [p2] =
        await tx`select id from public.avisos_entregas where aviso_id = ${id2} and canal = 'push'`;
      await tx`select public.concluir_entrega(${p2!.id}, 'enviado')`;
      const [w2] =
        await tx`select id from public.avisos_entregas where aviso_id = ${id2} and canal = 'whatsapp'`;
      await tx`select public.concluir_entrega(${w2!.id}, 'ignorado', 'CANAL_DESLIGADO')`;
      expect((await entregas(tx, id2)).some((e) => e.canal === 'email')).toBe(false);
    });
  });

  it('pagamento_falhou já tem o e-mail do dono; vendedor sem e-mail ativo não recebe reserva', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`delete from public.push_inscricoes where empresa_id = ${IDS.empresaA}`;
      const id = await criar(tx, 'pagamento_falhou', null, 'fallback:5');
      expect((await entregas(tx, id)).map((e) => e.canal)).toEqual(['email']);
      await tx`update public.usuarios set ativo = false where id = ${IDS.vendedorA}`;
      const [a] = await tx`select public._aviso_criar(${IDS.empresaA}, ${IDS.vendedorA},
        'pre_reserva_vencendo', ${await leadDe(tx)}, '{}'::jsonb, 'fallback:6', false) as id`;
      expect(await entregas(tx, a!.id)).toEqual([]);
    });
  });

  it('diagnóstico agrupa por canal, status e motivo; só para a conexão administrativa', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`delete from public.push_inscricoes where usuario_id = ${IDS.donoA}`;
      await tx`insert into public.preferencias_avisos
          (empresa_id, usuario_id, whatsapp_ativo, whatsapp_numero, whatsapp_aceite_em)
        values (${IDS.empresaA}, ${IDS.donoA}, true, '+5534990000001', now())
        on conflict (usuario_id) do update set whatsapp_ativo = true,
          whatsapp_numero = '+5534990000001', whatsapp_aceite_em = now()`;
      const id = await criar(tx, 'resumo_diario', null, 'fallback:7');
      const [w] =
        await tx`select id from public.avisos_entregas where aviso_id = ${id} and canal = 'whatsapp'`;
      await tx`select public.concluir_entrega(${w!.id}, 'ignorado', 'CANAL_DESLIGADO')`;
      const linhas =
        await tx`select canal, status, motivo, total::int from public.interno_entregas_resumo(30, true)`;
      expect(linhas).toContainEqual(
        expect.objectContaining({
          canal: 'whatsapp',
          status: 'ignorado',
          motivo: 'CANAL_DESLIGADO',
        }),
      );
      const [r] = await tx`select public.interno_canais_retrato(true) as r`;
      expect(r!.r).toEqual(expect.objectContaining({ usuarios_com_whatsapp: expect.any(Number) }));
      const [g] = await tx`select has_function_privilege('authenticated',
        'public.interno_entregas_resumo(integer, boolean)', 'execute') as a`;
      expect(g!.a).toBe(false);
    });
  });
});

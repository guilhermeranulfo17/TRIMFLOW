import { afterAll, describe, expect, it } from 'vitest';
import { assumirUsuario, conectar, emTransacao, esperarErroSql, IDS } from '../support/db';
import { criarEmpresaTemporaria, removerEmpresa } from '../support/empresa-temporaria';

/*
 * Etapa 8: Números. Permissões (dono, vendedor, outra empresa, anon), validação do período e
 * desempenho com 5.000 leads. A equivalência SQL × domínio fica em numeros-equivalencia.test.ts.
 */

const sql = conectar();
afterAll(() => sql.end());

describe('permissões', () => {
  it('dono vê a empresa; vendedor só os próprios leads; nada de outra empresa', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    try {
      await emTransacao(sql, async (tx) => {
        await tx`insert into public.leads (empresa_id, nome, whatsapp_e164, responsavel_id, origem)
          select ${e.empresaId}::uuid, 'L' || g, '+5534993' || lpad(g::text, 6, '0'),
                 case when g % 3 = 0 then ${e.vendedorId}::uuid end, 'instagram'
          from generate_series(1, 9) g`;
        // lead de teste nunca conta
        await tx`insert into public.leads (empresa_id, nome, whatsapp_e164, eh_teste)
          values (${e.empresaId}, 'Teste', '+5534993999999', true)`;
        const hoje = (await tx`select (now() at time zone 'America/Sao_Paulo')::date as d`)[0]!
          .d as Date;
        const de = new Date(hoje.getTime() - 6 * 86_400_000);

        await assumirUsuario(tx, e.donoId);
        const [dono] = await tx`select public.numeros(${de}::date, ${hoje}::date) as n`;
        expect(dono!.n.resumo.leads).toBe(9);
        await tx`reset role`;

        await assumirUsuario(tx, e.vendedorId);
        const [vend] = await tx`select public.numeros(${de}::date, ${hoje}::date) as n`;
        expect(vend!.n.resumo.leads).toBe(3);
        expect(vend!.n.resumo.visitas).toBe(0);
        await tx`reset role`;

        // dono de outra empresa (Buffet Teste B) só vê os leads da empresa dele
        const [{ n: daB }] = (await tx`select count(*)::int as n from public.leads
          where empresa_id = ${IDS.empresaB} and not eh_teste
            and (criado_em at time zone 'America/Sao_Paulo')::date between ${de}::date and ${hoje}::date`) as [
          { n: number },
        ];
        await assumirUsuario(tx, IDS.donoB);
        const [outra] = await tx`select public.numeros(${de}::date, ${hoje}::date) as n`;
        expect(outra!.n.resumo.leads).toBe(daB);
        await tx`reset role`;
      });
    } finally {
      await removerEmpresa(sql, e);
    }
  });

  it('período inválido, anon e helpers fechados', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      await tx`savepoint s`;
      await esperarErroSql(tx`select public.numeros('2026-10-10', '2026-10-01')`, '23514');
      await tx`rollback to savepoint s`;
      await esperarErroSql(tx`select public.numeros('2024-01-01', '2026-10-01')`, '23514');
    });
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      await esperarErroSql(
        tx`select public._numeros_calcular(${IDS.empresaB}, null, 'America/Sao_Paulo', '2026-10-01', '2026-10-31')`,
        '42501',
      );
    });
    await emTransacao(sql, async (tx) => {
      await tx`set local role anon`;
      await esperarErroSql(tx`select public.numeros('2026-10-01', '2026-10-31')`, '42501');
    });
  });

  it('ocupação do usuário logado', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      const [o] = await tx`select public.numeros_ocupacao() as o`;
      expect(o!.o.total.disponiveis).toBeGreaterThan(0);
      expect(Array.isArray(o!.o.datas_livres)).toBe(true);
    });
  });
});

describe('desempenho', () => {
  it('5.000 leads: numeros e numeros_ocupacao abaixo de 1 s (registra o tempo)', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    try {
      await emTransacao(sql, async (tx) => {
        await tx`set local session_replication_role = replica`;
        const [esp] = await tx`insert into public.espacos (empresa_id, nome, capacidade_max)
          values (${e.empresaId}, 'Salão', 120) returning id`;
        const [tur] =
          await tx`insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana)
          values (${e.empresaId}, 'Tarde', '14:00', 240, '{0,5,6}') returning id`;
        await tx`insert into public.leads (id, empresa_id, nome, whatsapp_e164, origem, status, temperatura,
                   responsavel_id, criado_em, perdido_em, motivo_perda_codigo, ultimo_passo)
          select gen_random_uuid(), ${e.empresaId}::uuid, 'Lead ' || g, '+55349' || lpad(g::text, 8, '0'),
                 (array['instagram','google','whatsapp','indicacao','link_direto','qrcode'])[1 + g % 6]::public.origem_lead,
                 (array['novo','em_andamento','pre_reservado','reservado','perdido','frio'])[1 + g % 6]::public.status_lead,
                 (array['frio','morno','quente'])[1 + g % 3]::public.temperatura_lead,
                 case when g % 2 = 0 then ${e.vendedorId}::uuid end,
                 now() - (g % 120) * interval '1 day',
                 case when g % 6 = 4 then now() - (g % 100) * interval '1 day' end,
                 case when g % 6 = 4 then 'preco'::public.motivo_perda end,
                 g % 7
          from generate_series(1, 5000) g`;
        await tx`insert into public.orcamentos (empresa_id, lead_id, numero, token, status, resultado, total_centavos, criado_em)
          select ${e.empresaId}::uuid, l.id, row_number() over (), md5(l.id::text) || md5(l.nome),
                 'enviado', '{}'::jsonb, 500000, l.criado_em + interval '1 hour'
          from public.leads l where l.empresa_id = ${e.empresaId} and l.nome ~ '[02468]$'`;
        await tx`insert into public.atividades (empresa_id, lead_id, tipo, autor, usuario_id, criado_em)
          select ${e.empresaId}::uuid, l.id, 'pre_reserva_pedida'::public.tipo_atividade, 'cliente'::public.autor_atividade, null::uuid, l.criado_em + interval '2 hours'
          from public.leads l where l.empresa_id = ${e.empresaId} and l.nome ~ '[05]$'
          union all
          select ${e.empresaId}::uuid, l.id, 'contato_registrado'::public.tipo_atividade, 'usuario'::public.autor_atividade, ${e.donoId}::uuid, l.criado_em + interval '3 hours'
          from public.leads l where l.empresa_id = ${e.empresaId} and l.nome ~ '[0135]$'`;
        await tx`insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status,
                   cliente_nome, lead_id, valor_total_centavos, confirmada_em)
          select ${e.empresaId}::uuid, ${esp!.id}::uuid, ${tur!.id}::uuid, (now() + (g % 90) * interval '1 day')::date,
                 now() + (g % 90) * interval '1 day', now() + (g % 90) * interval '1 day' + interval '4 hours',
                 'confirmada', 'ativa', l.nome, l.id, 700000, l.criado_em + interval '5 days'
          from (select id, nome, criado_em, row_number() over () g from public.leads
                where empresa_id = ${e.empresaId} and status = 'reservado') l`;
        await tx`insert into public.funil_eventos (empresa_id, sessao, passo, evento, origem, criado_em)
          select ${e.empresaId}::uuid, gen_random_uuid(), case when g % 3 = 0 then 0 else 1 + g % 6 end,
                 (case when g % 3 = 0 then 'pagina_vista' else 'passo_visto' end)::public.evento_funil,
                 'instagram', now() - (g % 120) * interval '1 day'
          from generate_series(1, 20000) g`;
        await tx`analyze public.leads, public.orcamentos, public.atividades, public.reservas, public.funil_eventos`;

        await assumirUsuario(tx, e.donoId);
        const medir = async (fn: () => Promise<unknown>) => {
          await fn(); // aquece
          const t = performance.now();
          await fn();
          return Math.round(performance.now() - t);
        };
        const msNumeros = await medir(
          () => tx`select public.numeros(current_date - 89, current_date)`,
        );
        const msMes = await medir(() => tx`select public.numeros(current_date - 29, current_date)`);
        const msOcupacao = await medir(() => tx`select public.numeros_ocupacao()`);
        await tx`reset role`;
        await assumirUsuario(tx, e.vendedorId);
        const msVendedor = await medir(
          () => tx`select public.numeros(current_date - 29, current_date)`,
        );
        console.info(
          `[numeros] 5.000 leads: 90 dias ${msNumeros} ms · 30 dias ${msMes} ms · vendedor ${msVendedor} ms · ocupação ${msOcupacao} ms`,
        );
        for (const ms of [msNumeros, msMes, msOcupacao, msVendedor]) expect(ms).toBeLessThan(1000);
      });
    } finally {
      await removerEmpresa(sql, e);
    }
  });
});

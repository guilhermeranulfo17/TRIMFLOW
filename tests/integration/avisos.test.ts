import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { assumirUsuario, conectar, emTransacao, esperarErroSql, IDS } from '../support/db';
import { criarEmpresaTemporaria, removerEmpresa } from '../support/empresa-temporaria';
import {
  cenarioPublico,
  comoAnon,
  concluir,
  dataDaqui,
  iniciar,
  preReservar,
  type Cenario,
} from '../support/publico';

/*
 * Etapa 7: avisos (fila outbox) e follow-up automático. As equivalências domínio × SQL ficam
 * em avisos-equivalencia.test.ts.
 */

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;

async function como<T>(tx: Tx, usuario: string, fn: () => Promise<T>): Promise<T> {
  await assumirUsuario(tx, usuario);
  try {
    return await fn();
  } finally {
    await tx`reset role`;
  }
}

let seq = 0;
function whatsapp() {
  seq += 1;
  return `+55349966${String(Date.now() % 10_000).padStart(4, '0')}${String(seq).padStart(2, '0')}`;
}

async function leadDoLink(tx: Tx, c: Cenario, o: { concluir?: boolean; dias?: number } = {}) {
  const data = await dataDaqui(tx, o.dias ?? 150);
  const token = await comoAnon(tx, async () => {
    const t = await iniciar(tx, c, { data, whatsapp: whatsapp() });
    return o.concluir === false ? t : concluir(tx, c, t, { data });
  });
  const [l] = await tx`select l.* from public.leads l
    join public.orcamentos o on o.lead_id = l.id where o.token = ${token}`;
  return { lead: l!, token, data };
}

async function avisosDoLead(tx: Tx | postgres.Sql, leadId: string) {
  return tx`select a.*, (select coalesce(json_agg(e.canal order by e.canal), '[]') from public.avisos_entregas e
              where e.aviso_id = a.id) as canais
            from public.avisos a where a.lead_id = ${leadId} order by a.criado_em, a.usuario_id`;
}

async function tarefasAuto(tx: Tx, leadId: string) {
  return tx`select * from public.tarefas where lead_id = ${leadId} and origem = 'regra' order by criado_em`;
}

describe('avisos de eventos do link (mesma transação)', () => {
  it('pré-reserva pedida: aviso para os donos (lead sem responsável), com o contexto', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead, token } = await leadDoLink(tx, c);
      const r = await comoAnon(tx, () => preReservar(tx, c, token));
      expect(r.ok).toBe(true);
      const avisos = await avisosDoLead(tx, lead.id as string);
      const pre = avisos.filter((a) => a.tipo === 'pre_reserva_pedida');
      expect(pre.map((a) => a.usuario_id)).toContain(IDS.donoA);
      expect(pre.map((a) => a.usuario_id)).not.toContain(IDS.vendedorA);
      expect(pre[0]!.dados).toMatchObject({ lead_nome: 'Maria Cliente', convidados: 50 });
      expect(pre[0]!.dados.reserva_id).toBeTruthy();
      expect(pre[0]!.lido_em).toBeNull();
    });
  });

  it('se a transação falha, o aviso não existe', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead, token } = await leadDoLink(tx, c);
      await tx
        .savepoint(async (sp) => {
          await comoAnon(sp as unknown as Tx, () => preReservar(sp, c, token));
          expect(
            (await avisosDoLead(sp as unknown as Tx, lead.id as string)).length,
          ).toBeGreaterThan(0);
          throw new Error('desfaz');
        })
        .catch(() => undefined);
      expect(await avisosDoLead(tx, lead.id as string)).toHaveLength(0);
    });
  });

  it('visita pedida pelo link', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead, token } = await leadDoLink(tx, c);
      const data = await dataDaqui(tx, 5);
      await comoAnon(
        tx,
        () =>
          tx`select publico.solicitar_visita(${c.slug}, ${token}, ${data}::date, 'tarde', null, 'ip-teste')`,
      );
      const [a] = (await avisosDoLead(tx, lead.id as string)).filter(
        (x) => x.tipo === 'visita_pedida',
      );
      expect(a!.dados).toMatchObject({ periodo: 'tarde', data_preferida: data });
    });
  });

  it('lead de teste não gera aviso', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 160);
      const token = await comoAnon(tx, async () => {
        const t = await iniciar(tx, c, { data, whatsapp: whatsapp(), teste: true });
        return concluir(tx, c, t, { data });
      });
      await comoAnon(tx, () => preReservar(tx, c, token));
      const [l] =
        await tx`select l.id from public.leads l join public.orcamentos o on o.lead_id = l.id
        where o.token = ${token}`;
      expect(await avisosDoLead(tx, l!.id as string)).toHaveLength(0);
    });
  });
});

describe('destinatário', () => {
  it('com responsável: só ele; dono com "receber também" recebe junto', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead, token } = await leadDoLink(tx, c);
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.atribuir_responsavel(${lead.id}, ${IDS.vendedorA})`,
      );
      await como(
        tx,
        IDS.donoA,
        () => tx`select public.salvar_preferencias_avisos('{}'::jsonb, '22:00', '07:00', true)`,
      );
      await comoAnon(tx, () => preReservar(tx, c, token));
      const usuarios = (await avisosDoLead(tx, lead.id as string))
        .filter((a) => a.tipo === 'pre_reserva_pedida')
        .map((a) => a.usuario_id)
        .sort();
      expect(usuarios).toEqual([IDS.donoA, IDS.vendedorA].sort());
    });
  });
});

describe('preferências, canais e silêncio', () => {
  it('entregas só nos canais ligados e com destino (push inscrito, WhatsApp ativo)', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead, token } = await leadDoLink(tx, c);
      await como(tx, IDS.donoA, async () => {
        await tx`select public.salvar_preferencias_avisos(${tx.json({ visita_pedida: [] })}, '00:00', '00:00', false)`;
        await tx`select public.inscrever_push('https://push.exemplo.test/abc', 'chave-p256dh-123', 'auth-1234', 'Celular')`;
        await tx`select public.ativar_whatsapp('+5534991355450', true)`;
      });
      await comoAnon(tx, () => preReservar(tx, c, token));
      const [a] = (await avisosDoLead(tx, lead.id as string)).filter(
        (x) => x.tipo === 'pre_reserva_pedida' && x.usuario_id === IDS.donoA,
      );
      expect(a!.canais).toEqual(['push', 'whatsapp']);
    });
  });

  it('silêncio: aparece na hora no painel, push e WhatsApp esperam o fim', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead, token } = await leadDoLink(tx, c);
      // silêncio de 1h antes a 1h depois de agora (no fuso da empresa)
      const [j] =
        await tx`select to_char((now() at time zone 'America/Sao_Paulo') - interval '1 hour', 'HH24:MI') as ini,
        to_char((now() at time zone 'America/Sao_Paulo') + interval '1 hour', 'HH24:MI') as fim`;
      await como(tx, IDS.donoA, async () => {
        await tx`select public.salvar_preferencias_avisos('{}'::jsonb, ${j!.ini}::time, ${j!.fim}::time, false)`;
        await tx`select public.inscrever_push('https://push.exemplo.test/silencio', 'chave-p256dh-123', 'auth-1234', null)`;
      });
      await comoAnon(tx, () => preReservar(tx, c, token));
      const [a] = await tx`select a.criado_em, a.agendado_para, e.proximo_envio_em, now() as agora
        from public.avisos a join public.avisos_entregas e on e.aviso_id = a.id
        where a.lead_id = ${lead.id} and a.usuario_id = ${IDS.donoA} and e.canal = 'push'`;
      expect((a!.criado_em as Date).getTime()).toBe((a!.agora as Date).getTime());
      expect((a!.agendado_para as Date).getTime()).toBeGreaterThan((a!.agora as Date).getTime());
      expect((a!.proximo_envio_em as Date).getTime()).toBe((a!.agendado_para as Date).getTime());
      // painel: o usuário vê o aviso já
      const lista = await como(
        tx,
        IDS.donoA,
        () => tx`select id from public.avisos where lead_id = ${lead.id}`,
      );
      expect(lista.length).toBeGreaterThan(0);
    });
  });

  it('aviso criado às 23h sai às 7h (regra pura, fuso da empresa)', async () => {
    const [r] =
      await sql`select public._aviso_agendar('2026-10-02 23:00-03', 'America/Sao_Paulo', '22:00', '07:00') as q`;
    expect((r!.q as Date).toISOString()).toBe('2026-10-03T10:00:00.000Z');
  });

  it('WhatsApp exige aceite e número válido; preferência inválida é recusada', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.vendedorA);
      await esperarErroSql(
        tx.savepoint((s) => s`select public.ativar_whatsapp('+5534991355450', false)`),
        '23514',
      );
      await esperarErroSql(
        tx.savepoint((s) => s`select public.ativar_whatsapp('34991355450', true)`),
        '23514',
      );
      await esperarErroSql(
        tx.savepoint(
          (s) =>
            s`select public.salvar_preferencias_avisos(${s.json({ teste: ['sms'] })}, '22:00', '07:00', false)`,
        ),
        '23514',
      );
      await tx`reset role`;
    });
  });

  it('agrupa dois avisos do mesmo tipo e lead em 10 minutos', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead } = await leadDoLink(tx, c);
      for (const k of ['x1', 'x2']) {
        await tx`select public._aviso_criar(${IDS.empresaA}, ${IDS.donoA}, 'visita_pedida', ${lead.id},
          ${tx.json({ lead_nome: 'Maria' })}, ${'agrupa:' + k + ':' + lead.id})`;
      }
      const avisos = await avisosDoLead(tx, lead.id as string);
      expect(avisos).toHaveLength(1);
      expect(avisos[0]!.agrupados).toBe(2);
    });
  });
});

describe('jobs: avisos de tempo e idempotência', () => {
  it('pré-reserva vencendo em 12h; rodar duas vezes não duplica; resolvida vira ignorado', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead, token } = await leadDoLink(tx, c);
      await como(
        tx,
        IDS.donoA,
        () =>
          tx`select public.inscrever_push('https://push.exemplo.test/venc', 'chave-p256dh-123', 'auth-1234', null)`,
      );
      await comoAnon(tx, () => preReservar(tx, c, token));
      await tx`update public.reservas set expira_em = now() + interval '10 hours' where lead_id = ${lead.id}`;
      await tx`select public.gerar_avisos_tempo()`;
      await tx`select public.gerar_avisos_tempo()`;
      const venc = (await avisosDoLead(tx, lead.id as string)).filter(
        (a) => a.tipo === 'pre_reserva_vencendo',
      );
      expect(venc).toHaveLength(1);

      // a pré-reserva foi cancelada antes do envio: a entrega fica "ignorado"
      const [r] =
        await tx`select id from public.reservas where lead_id = ${lead.id} and status = 'ativa'`;
      await como(
        tx,
        IDS.donoA,
        () => tx`select public.cancelar_reserva(${r!.id}, 'Cliente desistiu')`,
      );
      await tx`update public.avisos set agendado_para = now() - interval '1 minute' where id = ${venc[0]!.id}`;
      await tx`update public.avisos_entregas set proximo_envio_em = now() - interval '1 minute' where aviso_id = ${venc[0]!.id}`;
      const lote = await tx`select * from public.reservar_entregas(200)`;
      expect(lote.map((l) => l.aviso_id)).not.toContain(venc[0]!.id);
      const [e] =
        await tx`select status, erro_codigo from public.avisos_entregas where aviso_id = ${venc[0]!.id}`;
      expect(e).toMatchObject({ status: 'ignorado', erro_codigo: 'RESOLVIDO' });
    });
  });

  it('cliente parou no meio (passo ≥ 3, 30 min) e não repete', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead } = await leadDoLink(tx, c, { concluir: false });
      await tx`update public.leads set ultimo_passo = 4, ultima_atividade_em = now() - interval '40 minutes' where id = ${lead.id}`;
      await tx`select public.gerar_avisos_tempo()`;
      await tx`select public.gerar_avisos_tempo()`;
      const parou = (await avisosDoLead(tx, lead.id as string)).filter(
        (a) => a.tipo === 'cliente_parou',
      );
      expect(parou.length).toBeGreaterThanOrEqual(1);
      expect(new Set(parou.map((a) => a.usuario_id)).size).toBe(parou.length);
      expect(parou[0]!.dados).toMatchObject({ passo: 4 });
    });
  });

  it('resumo diário: uma vez por dia por usuário, nunca zerado', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    try {
      await sql`update public.empresas set fuso = 'UTC' where id = ${e.empresaId}`;
      const [h] = await sql`select extract(hour from now() at time zone 'UTC')::int as h`;
      await sql`select public.gerar_avisos_tempo()`;
      const zerado =
        await sql`select * from public.avisos where empresa_id = ${e.empresaId} and tipo = 'resumo_diario'`;
      expect(zerado).toHaveLength(0);
      // uma tarefa atrasada do dono
      const c = await cenarioPublico(sql, e.empresaId);
      const data = await dataDaqui(sql, 100);
      const token = await sql.begin(async (tx) =>
        comoAnon(tx, () => iniciar(tx, c, { data, whatsapp: whatsapp(), ip: `ip-${seq}` })),
      );
      const [l] =
        await sql`select l.id from public.leads l join public.orcamentos o on o.lead_id = l.id where o.token = ${token}`;
      await sql`insert into public.tarefas (empresa_id, lead_id, titulo, responsavel_id, vence_em)
        values (${e.empresaId}, ${l!.id}, 'Ligar', ${e.donoId}, now() - interval '1 day')`;
      await sql`select public.gerar_avisos_tempo()`;
      await sql`select public.gerar_avisos_tempo()`;
      const resumo =
        await sql`select * from public.avisos where empresa_id = ${e.empresaId} and tipo = 'resumo_diario'`;
      if ((h!.h as number) >= 8) {
        expect(resumo).toHaveLength(1);
        expect(resumo[0]!.usuario_id).toBe(e.donoId);
        expect(resumo[0]!.dados).toMatchObject({ atrasadas: 1 });
      } else {
        expect(resumo).toHaveLength(0);
      }
    } finally {
      await sql`delete from public.avisos where empresa_id = ${e.empresaId}`;
      await removerEmpresa(sql, e);
    }
  });
});

describe('fila de entregas', () => {
  it('skip locked: dois processadores ao mesmo tempo nunca pegam a mesma entrega', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    try {
      const avisos: string[] = [];
      for (let i = 0; i < 20; i++) {
        const [a] = await sql`insert into public.avisos (empresa_id, usuario_id, tipo, chave)
          values (${e.empresaId}, ${e.donoId}, 'teste', ${'fila:' + e.empresaId + ':' + i}) returning id`;
        avisos.push(a!.id as string);
        await sql`insert into public.avisos_entregas (empresa_id, aviso_id, canal)
          values (${e.empresaId}, ${a!.id}, 'push')`;
      }
      const c1 = conectar();
      const c2 = conectar();
      try {
        const [l1, l2] = await Promise.all([
          c1`select entrega_id, aviso_id from public.reservar_entregas(15) where aviso_id in ${c1(avisos)}`,
          c2`select entrega_id, aviso_id from public.reservar_entregas(15) where aviso_id in ${c2(avisos)}`,
        ]);
        const ids = [...l1, ...l2].map((r) => r.entrega_id as string);
        expect(new Set(ids).size).toBe(ids.length);
        const [n] = await sql`select count(*)::int as n from public.avisos_entregas
          where aviso_id in ${sql(avisos)} and status = 'enviando'`;
        expect(n!.n).toBe(ids.length);
      } finally {
        await c1.end();
        await c2.end();
      }
    } finally {
      await sql`delete from public.avisos where empresa_id = ${e.empresaId}`;
      await removerEmpresa(sql, e);
    }
  });

  it('erro: novas tentativas com espera crescente e "falhou" depois de 5; 410 apaga a inscrição', async () => {
    await emTransacao(sql, async (tx) => {
      await como(
        tx,
        IDS.vendedorA,
        () =>
          tx`select public.inscrever_push('https://push.exemplo.test/410', 'chave-p256dh-123', 'auth-1234', null)`,
      );
      const [a] = await tx`insert into public.avisos (empresa_id, usuario_id, tipo, chave)
        values (${IDS.empresaA}, ${IDS.vendedorA}, 'teste', ${'backoff:' + Date.now()}) returning id`;
      const [ent] =
        await tx`insert into public.avisos_entregas (empresa_id, aviso_id, canal, proximo_envio_em)
        values (${IDS.empresaA}, ${a!.id}, 'push', now() - interval '1 minute') returning id`;
      const esperas: number[] = [];
      for (let i = 1; i <= 5; i++) {
        await tx`update public.avisos_entregas set proximo_envio_em = now() - interval '1 second' where id = ${ent!.id}`;
        const lote = await tx`select * from public.reservar_entregas(500)`;
        expect(lote.find((l) => l.entrega_id === ent!.id)?.tentativas).toBe(i);
        const [s] = await tx`select public.concluir_entrega(${ent!.id}, 'erro', 'HTTP_500') as s`;
        const [p] =
          await tx`select extract(epoch from proximo_envio_em - now())::int as seg from public.avisos_entregas where id = ${ent!.id}`;
        esperas.push(p!.seg as number);
        expect(s!.s).toBe(i < 5 ? 'pendente' : 'falhou');
      }
      expect(esperas.slice(0, 4)).toEqual([60, 300, 900, 3600]);
      const [e2] =
        await tx`select erro_codigo, tentativas from public.avisos_entregas where id = ${ent!.id}`;
      expect(e2).toMatchObject({ erro_codigo: 'HTTP_500', tentativas: 5 });

      await tx`select public.concluir_entrega(${ent!.id}, 'erro', 'HTTP_410', ${['https://push.exemplo.test/410']})`;
      const insc =
        await tx`select 1 from public.push_inscricoes where endpoint = 'https://push.exemplo.test/410'`;
      expect(insc).toHaveLength(0);
    });
  });

  it('canal sem configuração fica "ignorado" com o código', async () => {
    await emTransacao(sql, async (tx) => {
      const [a] = await tx`insert into public.avisos (empresa_id, usuario_id, tipo, chave)
        values (${IDS.empresaA}, ${IDS.donoA}, 'teste', ${'ign:' + Date.now()}) returning id`;
      const [ent] = await tx`insert into public.avisos_entregas (empresa_id, aviso_id, canal)
        values (${IDS.empresaA}, ${a!.id}, 'whatsapp') returning id`;
      const [s] =
        await tx`select public.concluir_entrega(${ent!.id}, 'ignorado', 'CANAL_DESLIGADO') as s`;
      expect(s!.s).toBe('ignorado');
    });
  });
});

describe('follow-up automático', () => {
  it('sem resposta 24h: cria uma vez, com a regra e a mensagem; some quando o vendedor age', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead } = await leadDoLink(tx, c);
      await tx`update public.orcamentos set enviado_em = now() - interval '25 hours' where lead_id = ${lead.id}`;
      await tx`select public.gerar_tarefas_automaticas()`;
      await tx`select public.gerar_tarefas_automaticas()`;
      const t = (await tarefasAuto(tx, lead.id as string)).filter(
        (x) => x.regra === 'sem_resposta_24h',
      );
      expect(t).toHaveLength(1);
      expect(t[0]).toMatchObject({
        titulo: 'Chamar Maria: recebeu a proposta e não respondeu',
        origem: 'regra',
      });
      expect(t[0]!.mensagem_dados).toMatchObject({
        regra: 'sem_resposta_24h',
        proposta_aberta: false,
      });
      expect(t[0]!.responsavel_id).toBe(IDS.donoA); // sem responsável: o dono

      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.registrar_contato(${lead.id}, 'whatsapp', null)`,
      );
      const [depois] = await tx`select cancelada_em from public.tarefas where id = ${t[0]!.id}`;
      expect(depois!.cancelada_em).not.toBeNull();
    });
  });

  it('pré-reserva vencendo cria; confirmar a reserva cancela', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead, token } = await leadDoLink(tx, c);
      await comoAnon(tx, () => preReservar(tx, c, token));
      await tx`update public.reservas set expira_em = now() + interval '10 hours' where lead_id = ${lead.id}`;
      await tx`select public.gerar_tarefas_automaticas()`;
      const [t] = (await tarefasAuto(tx, lead.id as string)).filter(
        (x) => x.regra === 'pre_reserva_vencendo',
      );
      expect(t!.titulo).toBe('Cobrar o sinal de Maria: a pré-reserva vence logo');
      const [r] =
        await tx`select id from public.reservas where lead_id = ${lead.id} and status = 'ativa'`;
      await como(
        tx,
        IDS.donoA,
        () => tx`select public.confirmar_reserva(${r!.id}, 100000, current_date)`,
      );
      const [d] = await tx`select cancelada_em from public.tarefas where id = ${t!.id}`;
      expect(d!.cancelada_em).not.toBeNull();
    });
  });

  it('visita amanhã e quente sem contato', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead } = await leadDoLink(tx, c);
      // visita amanhã às 18h (no fuso), agendada há 2 dias pelo vendedor
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.agendar_visita(${lead.id},
          (((now() at time zone 'America/Sao_Paulo')::date + 1) + time '18:00') at time zone 'America/Sao_Paulo', null)`,
      );
      const [h] =
        await tx`select extract(hour from now() at time zone 'America/Sao_Paulo')::int as h`;
      await tx`select public.gerar_tarefas_automaticas()`;
      const visita = (await tarefasAuto(tx, lead.id as string)).filter(
        (x) => x.regra === 'visita_amanha',
      );
      if ((h!.h as number) >= 9) {
        expect(visita).toHaveLength(1);
        expect(visita[0]!.titulo).toBe('Confirmar a visita de Maria amanhã às 18:00');
      }
      // cancelar a visita cancela a tarefa
      const [v] = await tx`select id from public.visitas where lead_id = ${lead.id}`;
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.cancelar_visita(${v!.id}, 'Imprevisto')`,
      );
      const abertas = (await tarefasAuto(tx, lead.id as string)).filter(
        (x) => x.regra === 'visita_amanha' && !x.cancelada_em,
      );
      expect(abertas).toHaveLength(0);
    });
  });

  it('regra desligada não cria; lead de teste nunca tem tarefa automática', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`update public.regras_follow_up set ligada = false where empresa_id = ${IDS.empresaA} and regra = 'sem_resposta_24h'`;
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead } = await leadDoLink(tx, c);
      await tx`update public.orcamentos set enviado_em = now() - interval '25 hours' where lead_id = ${lead.id}`;
      const data = await dataDaqui(tx, 170);
      const tokenTeste = await comoAnon(tx, async () => {
        const t = await iniciar(tx, c, { data, whatsapp: whatsapp(), teste: true });
        return concluir(tx, c, t, { data });
      });
      await tx`update public.orcamentos set enviado_em = now() - interval '25 hours' where token = ${tokenTeste}`;
      await tx`select public.gerar_tarefas_automaticas()`;
      expect(
        (await tarefasAuto(tx, lead.id as string)).filter((x) => x.regra === 'sem_resposta_24h'),
      ).toHaveLength(0);
      const [lt] =
        await tx`select l.id from public.leads l join public.orcamentos o on o.lead_id = l.id where o.token = ${tokenTeste}`;
      expect(await tarefasAuto(tx, lt!.id as string)).toHaveLength(0);
    });
  });

  it('dono edita a regra dentro dos limites; vendedor não', async () => {
    await emTransacao(sql, async (tx) => {
      await como(
        tx,
        IDS.donoA,
        () => tx`select public.salvar_regra_follow_up('sem_resposta_24h', true, 48)`,
      );
      const [r] =
        await tx`select prazo from public.regras_follow_up where empresa_id = ${IDS.empresaA} and regra = 'sem_resposta_24h'`;
      expect(r!.prazo).toBe(48);
      await assumirUsuario(tx, IDS.donoA);
      await esperarErroSql(
        tx.savepoint((s) => s`select public.salvar_regra_follow_up('sem_resposta_24h', true, 2)`),
        '23514',
      );
      await tx`reset role`;
      await assumirUsuario(tx, IDS.vendedorA);
      await esperarErroSql(
        tx.savepoint((s) => s`select public.salvar_regra_follow_up('pos_visita', false, null)`),
        '42501',
      );
      await tx`reset role`;
    });
  });

  it('empresa nova ganha as 8 regras (proposta_vencida desligada)', async () => {
    const e = await criarEmpresaTemporaria(sql, 'eventos');
    try {
      const r =
        await sql`select regra, ligada from public.regras_follow_up where empresa_id = ${e.empresaId}`;
      expect(r).toHaveLength(8);
      expect(r.find((x) => x.regra === 'proposta_vencida')!.ligada).toBe(false);
    } finally {
      await removerEmpresa(sql, e);
    }
  });
});

describe('RLS e escrita só por funções', () => {
  it('cada um lê só os próprios avisos; outra empresa não lê nada', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`insert into public.avisos (empresa_id, usuario_id, tipo, chave)
        values (${IDS.empresaA}, ${IDS.donoA}, 'teste', ${'rls:' + Date.now()})`;
      const doDono = await como(
        tx,
        IDS.donoA,
        () => tx`select count(*)::int as n from public.avisos`,
      );
      const doVendedor = await como(
        tx,
        IDS.vendedorA,
        () => tx`select count(*)::int as n from public.avisos where usuario_id = ${IDS.donoA}`,
      );
      const deB = await como(
        tx,
        IDS.donoB,
        () => tx`select count(*)::int as n from public.avisos where empresa_id = ${IDS.empresaA}`,
      );
      expect(doDono[0]!.n).toBeGreaterThan(0);
      expect(doVendedor[0]!.n).toBe(0);
      expect(deB[0]!.n).toBe(0);
    });
  });

  it('ninguém escreve direto nas tabelas novas', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      const comandos = [
        (s: Tx) =>
          s`insert into public.avisos (empresa_id, usuario_id, tipo, chave) values (${IDS.empresaA}, ${IDS.donoA}, 'teste', 'x')`,
        (s: Tx) => s`update public.avisos set lido_em = now()`,
        (s: Tx) => s`delete from public.avisos_entregas`,
        (s: Tx) =>
          s`insert into public.push_inscricoes (empresa_id, usuario_id, endpoint, p256dh, auth) values (${IDS.empresaA}, ${IDS.donoA}, 'https://x', 'aaaaaaaaaaaa', 'bbbbbbbbbb')`,
        (s: Tx) => s`update public.regras_follow_up set ligada = false`,
        (s: Tx) => s`update public.preferencias_avisos set whatsapp_ativo = true`,
      ];
      for (const comando of comandos) {
        await esperarErroSql(
          tx.savepoint((s) => comando(s as unknown as Tx)),
          '42501',
        );
      }
      await esperarErroSql(
        tx.savepoint((s) => s`select public.gerar_tarefas_automaticas()`),
        '42501',
      );
      await esperarErroSql(
        tx.savepoint((s) => s`select * from public.reservar_entregas(1)`),
        '42501',
      );
      await tx`reset role`;
    });
  });

  it('marcar como lidos só mexe nos próprios', async () => {
    await emTransacao(sql, async (tx) => {
      const [a] = await tx`insert into public.avisos (empresa_id, usuario_id, tipo, chave)
        values (${IDS.empresaA}, ${IDS.donoA}, 'teste', ${'lido:' + Date.now()}) returning id`;
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.marcar_avisos_lidos(${[a!.id]}::uuid[])`,
      );
      const [x] = await tx`select lido_em from public.avisos where id = ${a!.id}`;
      expect(x!.lido_em).toBeNull();
      await como(tx, IDS.donoA, () => tx`select public.marcar_avisos_lidos(null)`);
      const [y] = await tx`select lido_em from public.avisos where id = ${a!.id}`;
      expect(y!.lido_em).not.toBeNull();
    });
  });
});

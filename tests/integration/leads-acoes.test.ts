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

async function esperarMensagem(tx: Tx, fn: () => Promise<unknown>, mensagem: string) {
  try {
    await tx.savepoint(async () => {
      await fn();
    });
  } catch (e) {
    expect((e as Error).message).toBe(mensagem);
    return;
  }
  throw new Error(`Esperava ${mensagem}, mas passou.`);
}

let seq = 0;
function whatsapp() {
  seq += 1;
  return `+55349977${String(Date.now() % 10_000).padStart(4, '0')}${String(seq).padStart(2, '0')}`;
}

/** Lead do link público: "novo" (só deu o WhatsApp) ou "em_andamento" (concluiu). */
async function novoLead(tx: Tx, c: Cenario, o: { concluir?: boolean; dias?: number } = {}) {
  const data = await dataDaqui(tx, o.dias ?? 120);
  const token = await comoAnon(tx, async () => {
    const t = await iniciar(tx, c, { data, whatsapp: whatsapp() });
    return o.concluir ? concluir(tx, c, t, { data }) : t;
  });
  const [l] = await tx`select l.* from public.leads l
    join public.orcamentos o on o.lead_id = l.id where o.token = ${token}`;
  return { lead: l!, token, data };
}

async function lead(tx: Tx | postgres.Sql, id: string) {
  const [l] = await tx`select * from public.leads where id = ${id}`;
  return l!;
}

async function tiposAtividade(tx: Tx, leadId: string) {
  const r =
    await tx`select tipo from public.atividades where lead_id = ${leadId} order by criado_em`;
  return r.map((a) => a.tipo as string);
}

describe('registrar contato e responsável', () => {
  it('novo → em andamento; primeiro contato, responsável e auditoria', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l } = await novoLead(tx, c);
      expect(l.status).toBe('novo');
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.registrar_contato(${l.id}, 'whatsapp', 'Pediu fotos do salão')`,
      );
      const depois = await lead(tx, l.id);
      expect(depois.status).toBe('em_andamento');
      expect(depois.primeiro_contato_em).not.toBeNull();
      expect(depois.ultima_acao_vendedor_em).not.toBeNull();
      expect(depois.responsavel_id).toBe(IDS.vendedorA);
      expect(await tiposAtividade(tx, l.id)).toContain('contato_registrado');
      const [a] = await tx`select acao from public.auditoria
        where entidade_id = ${l.id} and acao = 'lead.contato_registrado'`;
      expect(a).toBeDefined();

      // o dono agindo depois não vira responsável (já existe um)
      await como(
        tx,
        IDS.donoA,
        () => tx`select public.registrar_contato(${l.id}, 'ligacao', null)`,
      );
      expect((await lead(tx, l.id)).responsavel_id).toBe(IDS.vendedorA);
    });
  });

  it('abandonou e frio voltam para em andamento; perdido continua perdido', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      for (const [antes, depois] of [
        ['abandonou', 'em_andamento'],
        ['frio', 'em_andamento'],
        ['perdido', 'perdido'],
        ['pre_reservado', 'pre_reservado'],
      ] as const) {
        const { lead: l } = await novoLead(tx, c);
        await tx`update public.leads set status = ${antes} where id = ${l.id}`;
        await como(
          tx,
          IDS.vendedorA,
          () => tx`select public.registrar_contato(${l.id}, 'presencial', null)`,
        );
        expect((await lead(tx, l.id)).status).toBe(depois);
      }
    });
  });

  it('vendedor só assume para si; dono atribui a qualquer usuário ativo', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l } = await novoLead(tx, c);
      await como(tx, IDS.vendedorA, () =>
        esperarMensagem(
          tx,
          () => tx`select public.atribuir_responsavel(${l.id}, ${IDS.donoA})`,
          'LEAD_SO_ASSUMIR',
        ),
      );
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.atribuir_responsavel(${l.id}, ${IDS.vendedorA})`,
      );
      expect((await lead(tx, l.id)).responsavel_id).toBe(IDS.vendedorA);
      await como(
        tx,
        IDS.donoA,
        () => tx`select public.atribuir_responsavel(${l.id}, ${IDS.donoA})`,
      );
      expect((await lead(tx, l.id)).responsavel_id).toBe(IDS.donoA);
      // usuário de outra empresa não serve
      await como(tx, IDS.donoA, () =>
        esperarMensagem(
          tx,
          () => tx`select public.atribuir_responsavel(${l.id}, ${IDS.donoB})`,
          'LEAD_USUARIO_INVALIDO',
        ),
      );
      const atividades = await tx`select dados from public.atividades
        where lead_id = ${l.id} and tipo = 'responsavel_alterado' order by criado_em`;
      expect(atividades).toHaveLength(2);
      // atribuir não conta como primeiro contato
      expect((await lead(tx, l.id)).primeiro_contato_em).toBeNull();
    });
  });

  it('dados do lead: nome e e-mail mudam; WhatsApp não', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l } = await novoLead(tx, c);
      await como(
        tx,
        IDS.vendedorA,
        () =>
          tx`select public.atualizar_dados_lead(${l.id}, ' Maria da Silva ', 'Maria@Exemplo.com')`,
      );
      const d = await lead(tx, l.id);
      expect([d.nome, d.email, d.whatsapp_e164]).toEqual([
        'Maria da Silva',
        'maria@exemplo.com',
        l.whatsapp_e164,
      ]);
      await como(tx, IDS.vendedorA, () =>
        esperarMensagem(
          tx,
          () => tx`select public.atualizar_dados_lead(${l.id}, 'Maria', 'sem-arroba')`,
          'LEAD_DADOS_INVALIDOS',
        ),
      );
    });
  });
});

describe('notas', () => {
  it('só o autor edita em 24h; o dono apaga qualquer uma; atividade acompanha', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l } = await novoLead(tx, c);
      const [n] = await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.adicionar_nota(${l.id}, 'Prefere sábado à tarde') as id`,
      );
      const nota = n!.id as string;
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.editar_nota(${nota}, 'Prefere sábado à noite')`,
      );
      const [a] = await tx`select dados from public.atividades
        where lead_id = ${l.id} and tipo = 'nota'`;
      expect(a!.dados.trecho).toBe('Prefere sábado à noite');
      await como(tx, IDS.donoA, () =>
        esperarMensagem(tx, () => tx`select public.editar_nota(${nota}, 'x')`, 'NOTA_SO_AUTOR'),
      );

      // passou de 24h: o autor não edita nem apaga; o dono apaga
      await tx`update public.notas set criado_em = now() - interval '25 hours' where id = ${nota}`;
      await como(tx, IDS.vendedorA, () =>
        esperarMensagem(tx, () => tx`select public.apagar_nota(${nota})`, 'NOTA_PRAZO_ENCERRADO'),
      );
      await como(tx, IDS.donoA, () => tx`select public.apagar_nota(${nota})`);
      expect(await tx`select 1 from public.notas where id = ${nota}`).toHaveLength(0);
      expect(await tiposAtividade(tx, l.id)).not.toContain('nota');
      const [aud] = await tx`select dados from public.auditoria
        where entidade_id = ${nota} and acao = 'nota.apagada'`;
      expect(aud!.dados.texto).toBe('Prefere sábado à noite');
    });
  });
});

describe('tarefas', () => {
  it('criar, adiar, concluir, reabrir e cancelar', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l } = await novoLead(tx, c, { concluir: true });
      const [t] = await como(
        tx,
        IDS.vendedorA,
        () =>
          tx`select public.criar_tarefa(${l.id}, 'Mandar fotos', now() + interval '1 day') as id`,
      );
      const id = t!.id as string;
      let [tarefa] = await tx`select * from public.tarefas where id = ${id}`;
      expect(tarefa!.responsavel_id).toBe(IDS.vendedorA);
      expect(tarefa!.origem).toBe('manual');

      await como(tx, IDS.vendedorA, () =>
        esperarMensagem(
          tx,
          () => tx`select public.adiar_tarefa(${id}, now() - interval '1 hour')`,
          'TAREFA_DATA_INVALIDA',
        ),
      );
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.adiar_tarefa(${id}, now() + interval '3 days')`,
      );
      [tarefa] = await tx`select *, vence_efetivo = adiada_para as adiada from public.tarefas
        where id = ${id}`;
      expect(tarefa!.adiada).toBe(true);

      await como(tx, IDS.vendedorA, () => tx`select public.concluir_tarefa(${id})`);
      await como(tx, IDS.vendedorA, () =>
        esperarMensagem(
          tx,
          () => tx`select public.concluir_tarefa(${id})`,
          'TAREFA_ESTADO_INVALIDO',
        ),
      );
      await como(tx, IDS.vendedorA, () => tx`select public.reabrir_tarefa(${id})`);
      await como(tx, IDS.vendedorA, () => tx`select public.cancelar_tarefa(${id})`);
      [tarefa] = await tx`select * from public.tarefas where id = ${id}`;
      expect(tarefa!.feita_em).toBeNull();
      expect(tarefa!.cancelada_em).not.toBeNull();
      const tipos = await tiposAtividade(tx, l.id);
      expect(tipos).toContain('tarefa_criada');
      expect(tipos).toContain('tarefa_feita');
    });
  });

  it('próximo contato: uma tarefa só (índice por regra) e a data acompanha', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l } = await novoLead(tx, c, { concluir: true });
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.definir_proximo_contato(${l.id}, now() + interval '1 day')`,
      );
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.definir_proximo_contato(${l.id}, now() + interval '2 days')`,
      );
      const abertas = await tx`select titulo, vence_em > now() + interval '36 hours' as movida
        from public.tarefas where lead_id = ${l.id} and feita_em is null and cancelada_em is null`;
      expect(abertas).toHaveLength(1);
      expect(abertas[0]!.titulo).toBe(`Falar com ${l.nome}`);
      expect(abertas[0]!.movida).toBe(true);

      // o índice único impede duas tarefas abertas da mesma regra (a Etapa 7 depende disso)
      await esperarErroSql(
        tx.savepoint(
          (
            sp,
          ) => sp`insert into public.tarefas (empresa_id, lead_id, titulo, vence_em, origem, regra)
          values (${IDS.empresaA}, ${l.id}, 'Duplicada', now(), 'regra', 'proximo_contato')`,
        ),
        '23505',
      );
      const [t] =
        await tx`select id from public.tarefas where lead_id = ${l.id} and regra = 'proximo_contato'`;
      await como(tx, IDS.vendedorA, () => tx`select public.concluir_tarefa(${t!.id})`);
      expect((await lead(tx, l.id)).proximo_contato_em).toBeNull();
    });
  });

  it('tarefas abertas são canceladas quando o lead é reservado', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l, token } = await novoLead(tx, c, { concluir: true });
      await comoAnon(tx, () => preReservar(tx, c, token));
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.criar_tarefa(${l.id}, 'Cobrar sinal', now() + interval '2 hours')`,
      );
      const [r] =
        await tx`select id from public.reservas where lead_id = ${l.id} and status = 'ativa'`;
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.confirmar_reserva(${r!.id}, 150000, null)`,
      );
      expect((await lead(tx, l.id)).status).toBe('reservado');
      const abertas = await tx`select 1 from public.tarefas
        where lead_id = ${l.id} and feita_em is null and cancelada_em is null`;
      expect(abertas).toHaveLength(0);
    });
  });
});

describe('perdido e reabrir', () => {
  it('de cada status aberto vira perdido; reabrir volta ao estado certo', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      for (const [antes, reaberto] of [
        ['novo', 'novo'],
        ['em_andamento', 'em_andamento'],
        ['abandonou', 'abandonou'],
        ['frio', 'frio'],
      ] as const) {
        const { lead: l } = await novoLead(tx, c);
        await tx`update public.leads set status = ${antes} where id = ${l.id}`;
        await como(
          tx,
          IDS.vendedorA,
          () => tx`select public.criar_tarefa(${l.id}, 'Ligar', now() + interval '1 day')`,
        );
        await como(
          tx,
          IDS.vendedorA,
          () => tx`select public.marcar_perdido(${l.id}, 'preco', 'Achou caro')`,
        );
        const p = await lead(tx, l.id);
        expect([p.status, p.motivo_perda_codigo, p.motivo_perda, p.status_antes_de_perder]).toEqual(
          ['perdido', 'preco', 'Achou caro', antes],
        );
        const abertas = await tx`select 1 from public.tarefas
          where lead_id = ${l.id} and feita_em is null and cancelada_em is null`;
        expect(abertas).toHaveLength(0);

        const [r] = await como(
          tx,
          IDS.vendedorA,
          () => tx`select public.reabrir_lead(${l.id}) as s`,
        );
        expect(r!.s).toBe(reaberto);
        const d = await lead(tx, l.id);
        expect([d.status, d.motivo_perda_codigo, d.perdido_em]).toEqual([reaberto, null, null]);
      }
    });
  });

  it('com pré-reserva ativa: cancela, libera a data e reabre como em andamento', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l, token, data } = await novoLead(tx, c, { concluir: true, dias: 150 });
      await comoAnon(tx, () => preReservar(tx, c, token));
      expect((await lead(tx, l.id)).status).toBe('pre_reservado');

      const estado = () =>
        como(tx, IDS.vendedorA, async () => {
          const [s] = await tx`select estado from public.disponibilidade(
            ${IDS.empresaA}, ${data}::date, ${data}::date, ${c.espaco}) where turno_id = ${c.turno}`;
          return s!.estado as string;
        });
      expect(await tx.savepoint(() => estado())).toBe('pre_reservado');

      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.marcar_perdido(${l.id}, 'concorrente', null)`,
      );
      const p = await lead(tx, l.id);
      expect([p.status, p.status_antes_de_perder]).toEqual(['perdido', 'pre_reservado']);
      const [r] =
        await tx`select status, motivo_cancelamento from public.reservas where lead_id = ${l.id}`;
      expect([r!.status, r!.motivo_cancelamento]).toEqual([
        'cancelada',
        'Lead marcado como perdido',
      ]);
      expect(await tx.savepoint(() => estado())).toBe('livre');

      const [s] = await como(tx, IDS.vendedorA, () => tx`select public.reabrir_lead(${l.id}) as s`);
      expect(s!.s).toBe('em_andamento');
      const tipos = await tiposAtividade(tx, l.id);
      expect(tipos.slice(-3)).toEqual(['reserva_cancelada', 'perdido', 'reaberto']);
    });
  });

  it('reservado não pode ser perdido; "outro" exige detalhe; perdido não perde de novo', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l } = await novoLead(tx, c);
      await como(tx, IDS.vendedorA, () =>
        esperarMensagem(
          tx,
          () => tx`select public.marcar_perdido(${l.id}, 'outro', '  ')`,
          'LEAD_MOTIVO_OBRIGATORIO',
        ),
      );
      await tx`update public.leads set status = 'reservado' where id = ${l.id}`;
      await como(tx, IDS.vendedorA, () =>
        esperarMensagem(
          tx,
          () => tx`select public.marcar_perdido(${l.id}, 'preco', null)`,
          'LEAD_RESERVADO_NAO_PERDE',
        ),
      );
      await tx`update public.leads set status = 'em_andamento' where id = ${l.id}`;
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.marcar_perdido(${l.id}, 'outro', 'Mudou de cidade')`,
      );
      await como(tx, IDS.vendedorA, () =>
        esperarMensagem(
          tx,
          () => tx`select public.marcar_perdido(${l.id}, 'preco', null)`,
          'LEAD_ESTADO_INVALIDO',
        ),
      );
      await como(tx, IDS.vendedorA, () => tx`select public.reabrir_lead(${l.id})`);
      await como(tx, IDS.vendedorA, () =>
        esperarMensagem(tx, () => tx`select public.reabrir_lead(${l.id})`, 'LEAD_ESTADO_INVALIDO'),
      );
    });
  });

  it('cliente que volta tira o lead de perdido e limpa a perda', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l } = await novoLead(tx, c, { concluir: true });
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.marcar_perdido(${l.id}, 'sem_resposta', null)`,
      );
      await tx`select public._lead_aplicar_evento(${l.id}, 'voltou', null, 'cliente', null, '{}'::jsonb)`;
      const d = await lead(tx, l.id);
      expect([d.status, d.motivo_perda_codigo, d.perdido_em]).toEqual(['em_andamento', null, null]);
    });
  });
});

describe('visitas', () => {
  it('confirmar o pedido do link com dia e hora esquenta o lead; remarcar, realizar, cancelar', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l, token } = await novoLead(tx, c, { concluir: true });
      await tx`update public.leads set temperatura = 'morno' where id = ${l.id}`;
      const amanha = await dataDaqui(tx, 1);
      await comoAnon(
        tx,
        () =>
          tx`select publico.solicitar_visita(${c.slug}, ${token}, ${amanha}::date, 'tarde', null, 'ip-visita')`,
      );
      const [v] = await tx`select id from public.visitas where lead_id = ${l.id}`;
      await como(
        tx,
        IDS.vendedorA,
        () =>
          tx`select public.confirmar_visita(${v!.id}, (current_date + 1 + time '15:30') at time zone 'America/Sao_Paulo')`,
      );
      let [visita] = await tx`select * from public.visitas where id = ${v!.id}`;
      expect([visita!.status, visita!.periodo, visita!.confirmada_por]).toEqual([
        'confirmada',
        'tarde',
        IDS.vendedorA,
      ]);
      expect((await lead(tx, l.id)).temperatura).toBe('quente');
      await como(tx, IDS.vendedorA, () =>
        esperarMensagem(
          tx,
          () => tx`select public.confirmar_visita(${v!.id}, now() + interval '2 days')`,
          'VISITA_ESTADO_INVALIDO',
        ),
      );
      await como(
        tx,
        IDS.vendedorA,
        () =>
          tx`select public.remarcar_visita(${v!.id}, (current_date + 2 + time '10:00') at time zone 'America/Sao_Paulo')`,
      );
      [visita] = await tx`select periodo from public.visitas where id = ${v!.id}`;
      expect(visita!.periodo).toBe('manha');
      await como(tx, IDS.vendedorA, () => tx`select public.marcar_visita_realizada(${v!.id})`);

      const [nova] = await como(
        tx,
        IDS.vendedorA,
        () =>
          tx`select public.agendar_visita(${l.id}, now() + interval '5 days', 'Com os pais') as id`,
      );
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.cancelar_visita(${nova!.id}, 'Cliente desmarcou')`,
      );
      const tipos = await tiposAtividade(tx, l.id);
      for (const t of ['visita_confirmada', 'visita_realizada', 'visita_cancelada']) {
        expect(tipos).toContain(t);
      }
    });
  });
});

describe('mensagem pronta e esfriar', () => {
  it('registrar_mensagem grava mensagem_copiada', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l } = await novoLead(tx, c, { concluir: true });
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.registrar_mensagem(${l.id}, 'primeiro_contato', null)`,
      );
      const [a] = await tx`select dados from public.atividades
        where lead_id = ${l.id} and tipo = 'mensagem_copiada'`;
      expect(a!.dados.situacao).toBe('primeiro_contato');
    });
  });

  it('esfriar_leads: só lead aberto parado há 7 dias', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const casos = [
        ['em_andamento', 'quente', '8 days', 'frio'],
        ['em_andamento', 'morno', '6 days', 'morno'],
        ['pre_reservado', 'quente', '10 days', 'frio'],
        ['reservado', 'quente', '30 days', 'quente'],
        ['perdido', 'morno', '30 days', 'morno'],
      ] as const;
      const ids: string[] = [];
      for (const [status, temp, ha] of casos) {
        const { lead: l } = await novoLead(tx, c);
        await tx`update public.leads set status = ${status}, temperatura = ${temp},
          ultima_atividade_em = now() - ${ha}::interval where id = ${l.id}`;
        ids.push(l.id);
      }
      await tx`select public.esfriar_leads()`;
      for (const [i, caso] of casos.entries()) {
        expect((await lead(tx, ids[i]!)).temperatura).toBe(caso[3]);
      }
    });
  });
});

describe('acesso e isolamento', () => {
  it('outra empresa não age nem lê; ninguém escreve direto nas tabelas novas', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const { lead: l } = await novoLead(tx, c, { concluir: true });
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.adicionar_nota(${l.id}, 'Interna da A')`,
      );
      await como(
        tx,
        IDS.vendedorA,
        () => tx`select public.criar_tarefa(${l.id}, 'Da A', now() + interval '1 day')`,
      );
      for (const chamada of [
        () => tx`select public.registrar_contato(${l.id}, 'whatsapp', null)`,
        () => tx`select public.marcar_perdido(${l.id}, 'preco', null)`,
        () => tx`select public.adicionar_nota(${l.id}, 'Intrusa')`,
        () => tx`select public.criar_tarefa(${l.id}, 'Intrusa', now() + interval '1 day')`,
      ]) {
        await como(tx, IDS.donoB, () => esperarMensagem(tx, chamada, 'LEAD_NAO_ENCONTRADO'));
      }
      await como(tx, IDS.donoB, async () => {
        expect(await tx`select 1 from public.notas where lead_id = ${l.id}`).toHaveLength(0);
        expect(await tx`select 1 from public.tarefas where lead_id = ${l.id}`).toHaveLength(0);
        const caixa =
          await tx`select id from public.caixa_leads('{}', null, 100) where id = ${l.id}`;
        expect(caixa).toHaveLength(0);
      });
      for (const comando of [
        (sp: postgres.TransactionSql) =>
          sp`insert into public.notas (empresa_id, lead_id, texto) values (${IDS.empresaA}, ${l.id}, 'x')`,
        (sp: postgres.TransactionSql) => sp`update public.tarefas set titulo = 'x'`,
        (sp: postgres.TransactionSql) => sp`delete from public.notas`,
        (sp: postgres.TransactionSql) => sp`update public.leads set responsavel_id = null`,
      ]) {
        await como(tx, IDS.vendedorA, () => esperarErroSql(tx.savepoint(comando), '42501'));
      }
      await como(tx, IDS.vendedorA, () =>
        esperarErroSql(
          tx.savepoint((sp) => sp`select public.esfriar_leads()`),
          '42501',
        ),
      );
    });
  });
});

describe('caixa e resumo', () => {
  it('pré-reserva no topo, visita pedida em seguida, novo sem contato depois', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const pre = await novoLead(tx, c, { concluir: true, dias: 140 });
      await comoAnon(tx, () => preReservar(tx, c, pre.token));
      const visita = await novoLead(tx, c, { concluir: true, dias: 141 });
      await comoAnon(
        tx,
        () =>
          tx`select publico.solicitar_visita(${c.slug}, ${visita.token}, current_date + 3, 'manha', null, 'ip-v2')`,
      );
      const novo = await novoLead(tx, c);
      const linhas = await como(
        tx,
        IDS.vendedorA,
        () => tx`select id, grupo from public.caixa_leads('{}', null, 100)
          where id in ${tx([pre.lead.id, visita.lead.id, novo.lead.id])}`,
      );
      expect(linhas.map((l) => [l.id, l.grupo])).toEqual([
        [pre.lead.id, 1],
        [visita.lead.id, 2],
        [novo.lead.id, 5],
      ]);
      const [r] = await como(tx, IDS.vendedorA, () => tx`select * from public.resumo_hoje()`);
      expect(r!.pre_reservas).toBeGreaterThanOrEqual(1);
      expect(r!.visitas).toBeGreaterThanOrEqual(1);
      expect(r!.novos).toBeGreaterThanOrEqual(1);

      // atalho e busca
      const soPre = await como(
        tx,
        IDS.vendedorA,
        () => tx`select id from public.caixa_leads('{"atalho":"pre_reservas"}', null, 100)`,
      );
      expect(soPre.map((l) => l.id)).toContain(pre.lead.id);
      expect(soPre.map((l) => l.id)).not.toContain(novo.lead.id);
      const digitos = (novo.lead.whatsapp_e164 as string).slice(-8);
      const busca = await como(
        tx,
        IDS.vendedorA,
        () => tx`select id from public.caixa_leads(${tx.json({ busca: digitos })}, null, 100)`,
      );
      expect(busca.map((l) => l.id)).toEqual([novo.lead.id]);
    });
  });

  it('paginação por cursor não repete nem pula', async () => {
    await emTransacao(sql, async (tx) => {
      const todos = await como(
        tx,
        IDS.vendedorA,
        () => tx`select id, grupo, ordem from public.caixa_leads('{}', null, 100)`,
      );
      const paginas: string[] = [];
      let cursor: { g: number; o: number; id: string } | null = null;
      for (let i = 0; i < 50; i++) {
        const pagina = await como(
          tx,
          IDS.vendedorA,
          () =>
            tx`select id, grupo, ordem from public.caixa_leads('{}', ${cursor ? tx.json(cursor) : null}, 4)`,
        );
        if (pagina.length === 0) break;
        paginas.push(...pagina.map((p) => p.id as string));
        const ultimo = pagina.at(-1)!;
        cursor = {
          g: ultimo.grupo as number,
          o: ultimo.ordem as number,
          id: ultimo.id as string,
        };
      }
      expect(paginas).toEqual(todos.map((t) => t.id));
    });
  });
});

describe('concorrência: perdido × confirmar reserva (duas conexões reais)', () => {
  it('um vence e o outro recebe erro claro', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    const conexaoA = conectar();
    const conexaoB = conectar();
    try {
      const c = await cenarioPublico(sql, e.empresaId);
      const data = await dataDaqui(sql, 60);
      const token = await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('role', 'anon', true)`;
        const t = await iniciar(tx, c, { data, whatsapp: '+5534990066101' });
        const t2 = await concluir(tx, c, t, { data });
        await preReservar(tx, c, t2);
        return t2;
      });
      const [o] = await sql`select lead_id from public.orcamentos where token = ${token}`;
      const [r] =
        await sql`select id from public.reservas where lead_id = ${o!.lead_id} and status = 'ativa'`;

      let liberar!: () => void;
      const segurando = new Promise<void>((ok) => (liberar = ok));
      const perder = conexaoA.begin(async (tx) => {
        await assumirUsuario(tx, e.vendedorId);
        await tx`select public.marcar_perdido(${o!.lead_id}, 'preco', null)`;
        await segurando;
      });
      await new Promise((ok) => setTimeout(ok, 300));
      const confirmar = conexaoB.begin(async (tx) => {
        await assumirUsuario(tx, e.donoId);
        await tx`select public.confirmar_reserva(${r!.id}, 100000, null)`;
      });
      await new Promise((ok) => setTimeout(ok, 300));
      liberar();
      const [ra, rb] = await Promise.allSettled([perder, confirmar]);
      expect(ra.status).toBe('fulfilled');
      expect(rb.status).toBe('rejected');
      expect((rb as PromiseRejectedResult).reason.message).toBe('AGENDA_ESTADO_INVALIDO');
      const final = await lead(sql, o!.lead_id);
      expect(final.status).toBe('perdido');
      const [res] = await sql`select status from public.reservas where id = ${r!.id}`;
      expect(res!.status).toBe('cancelada');
    } finally {
      await conexaoA.end();
      await conexaoB.end();
      await removerEmpresa(sql, e);
    }
  });

  it('confirmar antes: perdido é recusado com LEAD_RESERVADO_NAO_PERDE', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    const conexaoA = conectar();
    const conexaoB = conectar();
    try {
      const c = await cenarioPublico(sql, e.empresaId);
      const data = await dataDaqui(sql, 61);
      const token = await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('role', 'anon', true)`;
        const t = await iniciar(tx, c, { data, whatsapp: '+5534990066102' });
        const t2 = await concluir(tx, c, t, { data });
        await preReservar(tx, c, t2);
        return t2;
      });
      const [o] = await sql`select lead_id from public.orcamentos where token = ${token}`;
      const [r] =
        await sql`select id from public.reservas where lead_id = ${o!.lead_id} and status = 'ativa'`;
      let liberar!: () => void;
      const segurando = new Promise<void>((ok) => (liberar = ok));
      const confirmar = conexaoB.begin(async (tx) => {
        await assumirUsuario(tx, e.donoId);
        await tx`select public.confirmar_reserva(${r!.id}, 100000, null)`;
        await segurando;
      });
      await new Promise((ok) => setTimeout(ok, 300));
      const perder = conexaoA.begin(async (tx) => {
        await assumirUsuario(tx, e.vendedorId);
        await tx`select public.marcar_perdido(${o!.lead_id}, 'preco', null)`;
      });
      await new Promise((ok) => setTimeout(ok, 300));
      liberar();
      const [rc, rp] = await Promise.allSettled([confirmar, perder]);
      expect(rc.status).toBe('fulfilled');
      expect((rp as PromiseRejectedResult).reason.message).toBe('LEAD_RESERVADO_NAO_PERDE');
      expect((await lead(sql, o!.lead_id)).status).toBe('reservado');
    } finally {
      await conexaoA.end();
      await conexaoB.end();
      await removerEmpresa(sql, e);
    }
  });
});

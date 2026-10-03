import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { assumirUsuario, conectar, emTransacao, esperarErroSql, IDS } from '../support/db';
import { comoAnon } from '../support/publico';

/*
 * Etapa 9A no banco: eventos do Asaas (idempotência, ordem, transação), situação da conta,
 * limites do plano, conta suspensa somente leitura, acesso de suporte, /interno, vitrine de
 * empresa suspensa e isolamento das tabelas novas. A equivalência com o domínio fica em
 * cobranca-equivalencia.test.ts.
 */

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;

/** Roda `fn` como o usuário e volta para postgres (sem claims) no fim. */
async function como<T>(tx: Tx, usuarioId: string, fn: () => Promise<T>): Promise<T> {
  await assumirUsuario(tx, usuarioId);
  try {
    return await fn();
  } finally {
    await tx`reset role`;
    await tx`select set_config('request.jwt.claims', '', true)`;
  }
}

/** Espera erro com a mensagem (código de negócio) dentro de um savepoint. */
async function esperarMensagem(tx: Tx, fn: (sp: Tx) => Promise<unknown>, mensagem: string) {
  let erro: unknown;
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp as unknown as Tx);
    });
  } catch (e) {
    erro = e;
  }
  expect((erro as { message?: string } | undefined)?.message, mensagem).toBe(mensagem);
}

type Empresa = { id: string; dono: string; vendedor: string; slug: string };

/** Empresa nova (dono + vendedor) dentro da transação. */
async function novaEmpresa(tx: Tx, o: { trialDias?: number } = {}): Promise<Empresa> {
  const sufixo = randomUUID().slice(0, 8);
  const slug = `buffet-cob-${sufixo}`;
  const [e] = await tx`insert into public.empresas (nome, slug, segmento, plano, trial_ate)
    values (${'Buffet ' + sufixo}, ${slug}, 'infantil', 'trial',
            now() + make_interval(days => ${o.trialDias ?? 10})) returning id`;
  const ids = { dono: randomUUID(), vendedor: randomUUID() };
  for (const [perfil, id] of Object.entries(ids)) {
    const email = `${perfil}-${sufixo}@cob.test`;
    await tx`insert into auth.users (id, email, aud, role) values (${id}, ${email}, 'authenticated', 'authenticated')`;
    await tx`insert into public.usuarios (id, empresa_id, nome, email, perfil)
      values (${id}, ${e!.id}, ${'Pessoa ' + perfil}, ${email}, ${perfil})`;
  }
  return { id: e!.id as string, slug, ...ids };
}

async function novaAssinatura(
  tx: Tx,
  empresa: string,
  o: { plano?: string; ciclo?: string; status?: string; pagoAte?: string | null } = {},
) {
  const asaas = `sub_${randomUUID().slice(0, 8)}`;
  const status = o.status ?? 'pendente';
  const [a] =
    await tx`insert into public.assinaturas (empresa_id, asaas_assinatura_id, plano_codigo,
      ciclo, valor_centavos, status, pago_ate, cancelada_em)
    values (${empresa}, ${asaas}, ${o.plano ?? 'profissional'}, ${o.ciclo ?? 'mensal'}, 9700, ${status},
      ${o.pagoAte ?? null}, ${status === 'cancelada' ? new Date() : null}) returning id`;
  return { id: a!.id as string, asaas };
}

const hojeSP = async (tx: Tx, mais = 0) => {
  const [l] =
    await tx`select ((now() at time zone 'America/Sao_Paulo')::date + ${mais}::int)::text as d`;
  return l!.d as string;
};

const evento = (o: {
  id?: string;
  tipo: string;
  tratado?: boolean;
  cobranca?: Record<string, unknown> | null;
  assinaturaCancelada?: Record<string, unknown> | null;
}) => ({
  evento_id: o.id ?? `evt_${randomUUID()}`,
  tipo: o.tipo,
  tratado: o.tratado ?? true,
  cobranca: o.cobranca ?? null,
  assinatura_cancelada: o.assinaturaCancelada ?? null,
});

const registrar = async (tx: Tx, e: ReturnType<typeof evento>) => {
  const [l] =
    await tx`select public.cobranca_registrar_evento(${tx.json(e as never)}, '{}'::jsonb) as r`;
  return l!.r as string;
};

const plano = async (tx: Tx, empresa: string) => {
  const [l] = await tx`select plano from public.empresas where id = ${empresa}`;
  return l!.plano as string;
};

const avisos = (tx: Tx, empresa: string, tipo: string) =>
  tx`select usuario_id, dados from public.avisos where empresa_id = ${empresa} and tipo = ${tipo}::public.tipo_aviso`;

describe('eventos do Asaas', () => {
  it('fatura criada → paga: idempotente, ativa a assinatura e a conta, avisa só o dono', async () => {
    await emTransacao(sql, async (tx) => {
      const e = await novaEmpresa(tx, { trialDias: -1 });
      await tx`select public._atualizar_situacao(${e.id})`;
      expect(await plano(tx, e.id)).toBe('suspenso');
      const a = await novaAssinatura(tx, e.id);
      const venc = await hojeSP(tx);
      const cobranca = {
        asaas_id: 'pay_t1',
        assinatura_asaas_id: a.asaas,
        valor_centavos: 9700,
        vencimento: venc,
        status: 'pendente',
        link_fatura: 'https://sandbox.asaas.com/i/t1',
      };
      const criada = evento({ id: 'evt_t1', tipo: 'PAYMENT_CREATED', cobranca });
      expect(await registrar(tx, criada)).toBe('cobranca');
      expect(await registrar(tx, criada)).toBe('duplicado');
      expect(
        await tx`select 1 from public.cobrancas where asaas_cobranca_id = 'pay_t1'`,
      ).toHaveLength(1);
      const fatura = await avisos(tx, e.id, 'fatura_criada');
      expect(fatura.map((x) => x.usuario_id)).toEqual([e.dono]);
      expect(await plano(tx, e.id)).toBe('suspenso');

      expect(
        await registrar(
          tx,
          evento({
            tipo: 'PAYMENT_RECEIVED',
            cobranca: { ...cobranca, status: 'recebida', pago_em: venc },
          }),
        ),
      ).toBe('cobranca');
      const [ass] =
        await tx`select status, pago_ate::text from public.assinaturas where id = ${a.id}`;
      const [esperado] =
        await tx`select ((${venc}::date + interval '1 month')::date - 1)::text as d`;
      expect(ass).toEqual({ status: 'ativa', pago_ate: esperado!.d });
      expect(await plano(tx, e.id)).toBe('ativo');
      expect(await avisos(tx, e.id, 'pagamento_confirmado')).toHaveLength(1);
      // auditoria da mudança de situação
      expect(
        await tx`select dados from public.auditoria where empresa_id = ${e.id} and acao = 'conta.situacao'
          order by criado_em`,
      ).toEqual([
        { dados: { antes: 'trial', depois: 'suspenso' } },
        { dados: { antes: 'suspenso', depois: 'ativo' } },
      ]);
    });
  });

  it('evento fora de ordem não regride (OVERDUE depois de RECEIVED)', async () => {
    await emTransacao(sql, async (tx) => {
      const e = await novaEmpresa(tx);
      const a = await novaAssinatura(tx, e.id);
      const c = {
        asaas_id: 'pay_t2',
        assinatura_asaas_id: a.asaas,
        valor_centavos: 9700,
        vencimento: await hojeSP(tx, -3),
      };
      await registrar(
        tx,
        evento({ tipo: 'PAYMENT_RECEIVED', cobranca: { ...c, status: 'recebida' } }),
      );
      await registrar(
        tx,
        evento({ tipo: 'PAYMENT_OVERDUE', cobranca: { ...c, status: 'vencida' } }),
      );
      await registrar(
        tx,
        evento({ tipo: 'PAYMENT_CREATED', cobranca: { ...c, status: 'pendente' } }),
      );
      const [cob] =
        await tx`select status from public.cobrancas where asaas_cobranca_id = 'pay_t2'`;
      expect(cob!.status).toBe('recebida');
      expect(await avisos(tx, e.id, 'pagamento_falhou')).toHaveLength(0);
      expect(await plano(tx, e.id)).toBe('ativo');
    });
  });

  it('atraso: inadimplente com aviso de carência; depois de 7 dias, suspensa', async () => {
    await emTransacao(sql, async (tx) => {
      const e = await novaEmpresa(tx, { trialDias: -40 });
      const a = await novaAssinatura(tx, e.id);
      // mês anterior pago (cobre até ~3 dias atrás)
      const [venc] =
        await tx`select ((${await hojeSP(tx, -2)}::date - interval '1 month')::date)::text as d`;
      await registrar(
        tx,
        evento({
          tipo: 'PAYMENT_RECEIVED',
          cobranca: {
            asaas_id: 'pay_t3a',
            assinatura_asaas_id: a.asaas,
            valor_centavos: 9700,
            vencimento: venc!.d,
            status: 'recebida',
          },
        }),
      );
      await registrar(
        tx,
        evento({
          tipo: 'PAYMENT_OVERDUE',
          cobranca: {
            asaas_id: 'pay_t3',
            assinatura_asaas_id: a.asaas,
            valor_centavos: 9700,
            vencimento: await hojeSP(tx, -2),
            status: 'vencida',
          },
        }),
      );
      expect(await plano(tx, e.id)).toBe('inadimplente');
      expect(await avisos(tx, e.id, 'pagamento_falhou')).toHaveLength(1);
      const [carencia] = await avisos(tx, e.id, 'carencia');
      expect(carencia!.dados).toEqual({ suspende_em: await hojeSP(tx, 6) });
      await tx`select public._atualizar_situacao(${e.id}, now() + interval '7 days')`;
      expect(await plano(tx, e.id)).toBe('suspenso');
      expect(await avisos(tx, e.id, 'conta_suspensa')).toHaveLength(1);
    });
  });

  it('assinatura cancelada no Asaas: acesso até o fim do período pago', async () => {
    await emTransacao(sql, async (tx) => {
      const e = await novaEmpresa(tx, { trialDias: -20 });
      const a = await novaAssinatura(tx, e.id, { status: 'ativa', pagoAte: await hojeSP(tx, 10) });
      expect(
        await registrar(
          tx,
          evento({ tipo: 'SUBSCRIPTION_DELETED', assinaturaCancelada: { asaas_id: a.asaas } }),
        ),
      ).toBe('assinatura_cancelada');
      expect(await plano(tx, e.id)).toBe('cancelado');
      await tx`select public._atualizar_situacao(${e.id}, now() + interval '11 days')`;
      expect(await plano(tx, e.id)).toBe('suspenso');
    });
  });

  it('desconhecido é ignorado; sem empresa fica registrado; erro no meio desfaz tudo', async () => {
    await emTransacao(sql, async (tx) => {
      expect(
        await registrar(tx, evento({ id: 'evt_x1', tipo: 'ACCOUNT_STATUS', tratado: false })),
      ).toBe('ignorado');
      expect(
        await registrar(
          tx,
          evento({
            tipo: 'PAYMENT_CREATED',
            cobranca: {
              asaas_id: 'pay_orfa',
              valor_centavos: 100,
              vencimento: '2026-11-10',
              status: 'pendente',
              referencia: randomUUID(),
            },
          }),
        ),
      ).toBe('sem_empresa');
      const [ign] =
        await tx`select ignorado, resultado from public.cobranca_eventos where asaas_evento_id = 'evt_x1'`;
      expect(ign).toEqual({ ignorado: true, resultado: 'ignorado' });

      const e = await novaEmpresa(tx);
      const a = await novaAssinatura(tx, e.id);
      // valor ausente: falha no insert da cobrança, depois de gravar o evento → nada fica
      await esperarMensagem(
        tx,
        (sp) =>
          sp`select public.cobranca_registrar_evento(${sp.json(
            evento({
              id: 'evt_quebrado',
              tipo: 'PAYMENT_CREATED',
              cobranca: {
                asaas_id: 'pay_q',
                assinatura_asaas_id: a.asaas,
                vencimento: '2026-11-10',
                status: 'pendente',
              },
            }) as never,
          )}, '{}'::jsonb)`,
        'null value in column "valor_centavos" of relation "cobrancas" violates not-null constraint',
      );
      expect(
        await tx`select 1 from public.cobranca_eventos where asaas_evento_id = 'evt_quebrado'`,
      ).toEqual([]);
    });
  });

  it('cupom: reserva atômica, uma vez por empresa, respeita o máximo', async () => {
    await emTransacao(sql, async (tx) => {
      const [c] =
        await tx`insert into public.cupons (codigo, plano_codigo, desconto_centavos, duracao_meses, max_usos)
        values ('TESTE2', 'profissional', 1000, 3, 2) returning id`;
      const e1 = await novaEmpresa(tx);
      const e2 = await novaEmpresa(tx);
      const e3 = await novaEmpresa(tx);
      await tx`select public.cobranca_reservar_cupom(${c!.id}, ${e1.id})`;
      await esperarMensagem(
        tx,
        (sp) => sp`select public.cobranca_reservar_cupom(${c!.id}, ${e1.id})`,
        'CUPOM_JA_USADO',
      );
      await tx`select public.cobranca_reservar_cupom(${c!.id}, ${e2.id})`;
      await esperarMensagem(
        tx,
        (sp) => sp`select public.cobranca_reservar_cupom(${c!.id}, ${e3.id})`,
        'CUPOM_ESGOTADO',
      );
      const [u] = await tx`select usos from public.cupons where id = ${c!.id}`;
      expect(u!.usos).toBe(2);
    });
  });
});

describe('situação e avisos de teste', () => {
  it('teste acabando a 3 dias e a 1 dia (uma vez cada); quem assinou não recebe', async () => {
    await emTransacao(sql, async (tx) => {
      const e = await novaEmpresa(tx, { trialDias: 2 });
      const assinou = await novaEmpresa(tx, { trialDias: 2 });
      await novaAssinatura(tx, assinou.id);
      await tx`select public.atualizar_situacoes()`;
      await tx`select public.atualizar_situacoes()`;
      const a = await avisos(tx, e.id, 'teste_acabando');
      expect(a.map((x) => x.dados)).toEqual([{ dias: 2 }]);
      expect(await avisos(tx, assinou.id, 'teste_acabando')).toHaveLength(0);
      await tx`select public.atualizar_situacoes(now() + interval '1 day 12 hours')`;
      expect(await avisos(tx, e.id, 'teste_acabando')).toHaveLength(2);
      await tx`select public.atualizar_situacoes(now() + interval '3 days')`;
      expect(await plano(tx, e.id)).toBe('suspenso');
    });
  });

  it('suspensa não recebe avisos de operação nem tarefa automática', async () => {
    await emTransacao(sql, async (tx) => {
      const e = await novaEmpresa(tx, { trialDias: -1 });
      await tx`select public._atualizar_situacao(${e.id})`;
      const [r] =
        await tx`select public._aviso_criar(${e.id}, ${e.dono}, 'teste', null, '{}', ${'t:' + e.id}) as id`;
      expect(r!.id).toBeNull();
      const [c] =
        await tx`select public._aviso_criar(${e.id}, ${e.dono}, 'conta_suspensa', null, '{}', ${'c:' + e.id}) as id`;
      expect(c!.id).not.toBeNull();
      const [lead] = await tx`insert into public.leads (empresa_id, nome, whatsapp_e164, origem)
        values (${e.id}, 'Cliente', '+5534990000001', 'link_direto') returning id`;
      await tx`insert into public.tarefas (empresa_id, lead_id, titulo, responsavel_id, vence_em, origem, regra)
        values (${e.id}, ${lead!.id}, 'Auto', ${e.dono}, now(), 'regra', 'segundo_toque')`;
      expect(await tx`select 1 from public.tarefas where lead_id = ${lead!.id}`).toEqual([]);
    });
  });
});

describe('limites do plano (Essencial)', () => {
  async function essencial(tx: Tx) {
    const e = await novaEmpresa(tx, { trialDias: -1 });
    await novaAssinatura(tx, e.id, {
      plano: 'essencial',
      status: 'ativa',
      pagoAte: await hojeSP(tx, 20),
    });
    await tx`select public._atualizar_situacao(${e.id})`;
    expect(await plano(tx, e.id)).toBe('ativo');
    return e;
  }

  it('3º usuário recusado no banco (insert e reativação, mesmo pelo admin)', async () => {
    await emTransacao(sql, async (tx) => {
      const e = await essencial(tx);
      const novo = randomUUID();
      await tx`insert into auth.users (id, email) values (${novo}, ${novo + '@cob.test'})`;
      await esperarMensagem(
        tx,
        (sp) => sp`insert into public.usuarios (id, empresa_id, nome, email, perfil)
          values (${novo}, ${e.id}, 'Terceiro', ${novo + '@cob.test'}, 'vendedor')`,
        'LIMITE_PLANO_USUARIOS',
      );
      await tx`update public.usuarios set ativo = false where id = ${e.vendedor}`;
      await tx`insert into public.usuarios (id, empresa_id, nome, email, perfil)
        values (${novo}, ${e.id}, 'Terceiro', ${novo + '@cob.test'}, 'vendedor')`;
      await esperarMensagem(
        tx,
        (sp) => sp`update public.usuarios set ativo = true where id = ${e.vendedor}`,
        'LIMITE_PLANO_USUARIOS',
      );
      // mudar só o nome de quem já está ativo continua livre
      await tx`update public.usuarios set nome = 'Outro nome' where id = ${novo}`;
    });
  });

  it('2º espaço, WhatsApp e follow-up recusados; downgrade não apaga nada', async () => {
    await emTransacao(sql, async (tx) => {
      const e = await essencial(tx);
      await tx`insert into public.espacos (empresa_id, nome, capacidade_max) values (${e.id}, 'Salão 1', 100)`;
      await esperarMensagem(
        tx,
        (sp) =>
          sp`insert into public.espacos (empresa_id, nome, capacidade_max) values (${e.id}, 'Salão 2', 100)`,
        'LIMITE_PLANO_ESPACOS',
      );
      await tx`insert into public.espacos (empresa_id, nome, capacidade_max, ativo) values (${e.id}, 'Inativo', 100, false)`;
      await esperarMensagem(
        tx,
        (
          sp,
        ) => sp`insert into public.preferencias_avisos (usuario_id, empresa_id, whatsapp_ativo, whatsapp_numero, whatsapp_aceite_em)
          values (${e.dono}, ${e.id}, true, '+5534990000002', now())`,
        'LIMITE_PLANO_WHATSAPP',
      );
      await esperarMensagem(
        tx,
        (sp) =>
          sp`update public.regras_follow_up set ligada = true where empresa_id = ${e.id} and regra = 'proposta_vencida'`,
        'LIMITE_PLANO_FOLLOW_UP',
      );
      // no Profissional (mudança de plano) libera; voltar ao Essencial mantém o que existe
      await tx`update public.assinaturas set plano_codigo = 'profissional' where empresa_id = ${e.id}`;
      await tx`insert into public.espacos (empresa_id, nome, capacidade_max) values (${e.id}, 'Salão 2', 100)`;
      await tx`update public.assinaturas set plano_codigo = 'essencial' where empresa_id = ${e.id}`;
      const [n] =
        await tx`select count(*)::int as n from public.espacos where empresa_id = ${e.id} and ativo`;
      expect(n!.n).toBe(2);
    });
  });
});

describe('conta suspensa = somente leitura', () => {
  it('toda tabela de negócio (com empresa_id) tem o trigger', async () => {
    const semTrigger = await sql`
      select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'empresa_id' and t.table_type = 'BASE TABLE'
        and c.table_name not in ('avisos', 'avisos_entregas', 'auditoria', 'auditoria_interna',
          'acessos_suporte', 'assinaturas', 'cobrancas', 'cobranca_eventos', 'cupons_usos',
          'empresas_cobranca', 'push_inscricoes', 'preferencias_avisos', 'funil_eventos')
        and not exists (select 1 from pg_trigger g
          where g.tgrelid = format('public.%I', c.table_name)::regclass
            and g.tgfoid = 'public._exigir_escrita()'::regprocedure)`;
    expect(semTrigger).toEqual([]);
  });

  // Funções security definer de escrita concedidas a authenticated. As "livres" seguem com a
  // conta suspensa (avisos, preferências pessoais, push, consentimento do suporte). Função nova
  // precisa entrar numa das listas (e, se escreve, num caso abaixo).
  const LIVRES = [
    'marcar_avisos_lidos',
    'salvar_preferencias_avisos',
    'inscrever_push',
    'remover_push',
    'ativar_whatsapp',
    'desativar_whatsapp',
    'criar_aviso_teste',
    'permitir_suporte',
    'revogar_suporte',
    // Etapa 9.5: conta nova pelo Google (ainda não há empresa, então nada a bloquear)
    'completar_conta_dono',
  ];
  const BLOQUEADAS = [
    'alterar_slug',
    'criar_reserva',
    'confirmar_reserva',
    'cancelar_reserva',
    'estender_pre_reserva',
    'criar_bloqueio',
    'remover_bloqueio',
    'salvar_orcamento_interno',
    'pre_reservar_orcamento',
    'marcar_orcamento_enviado',
    'registrar_contato',
    'atualizar_dados_lead',
    'atribuir_responsavel',
    'registrar_mensagem',
    'adicionar_nota',
    'editar_nota',
    'apagar_nota',
    'criar_tarefa',
    'concluir_tarefa',
    'adiar_tarefa',
    'reabrir_tarefa',
    'cancelar_tarefa',
    'definir_proximo_contato',
    'marcar_perdido',
    'reabrir_lead',
    'agendar_visita',
    'confirmar_visita',
    'remarcar_visita',
    'cancelar_visita',
    'marcar_visita_realizada',
    'salvar_regra_follow_up',
    'avancar_onboarding',
    'confirmar_precos',
    'marcar_link_na_bio',
    'marcar_link_testado',
    'dispensar_checklist',
  ];

  it('toda função de escrita do painel está classificada', async () => {
    const fs =
      await sql`select p.proname as nome from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and p.provolatile = 'v'
        and has_function_privilege('authenticated', p.oid, 'execute') order by 1`;
    expect(fs.map((f) => f.nome).sort()).toEqual([...LIVRES, ...BLOQUEADAS].sort());
  });

  it('funções e escrita direta recusadas; leitura, avisos e suporte continuam', async () => {
    await emTransacao(sql, async (tx) => {
      const empresa = IDS.empresaA;
      const [lead] =
        await tx`select id from public.leads where empresa_id = ${empresa} and not eh_teste
        and status not in ('perdido', 'reservado', 'realizado') order by criado_em limit 1`;
      const [tarefa] = await tx`select id from public.tarefas where empresa_id = ${empresa}
        and feita_em is null and cancelada_em is null limit 1`;
      const [nota] = await tx`insert into public.notas (empresa_id, lead_id, autor_id, texto)
        values (${empresa}, ${lead!.id}, ${IDS.donoA}, 'Nota do dono') returning id`;
      const [espaco] =
        await tx`select id from public.espacos where empresa_id = ${empresa} limit 1`;
      const [reserva] =
        await tx`select id from public.reservas where empresa_id = ${empresa} and status = 'ativa'
        and tipo = 'pre_reserva' and expira_em > now() limit 1`;
      const amanha = await hojeSP(tx, 40);
      // marcar_link_testado só grava a primeira vez
      await tx`update public.empresas set plano = 'suspenso', link_testado_em = null where id = ${empresa}`;

      const chamadas: [string, (sp: Tx) => Promise<unknown>][] = [
        ['adicionar_nota', (sp) => sp`select public.adicionar_nota(${lead!.id}, 'oi')`],
        ['editar_nota', (sp) => sp`select public.editar_nota(${nota!.id}, 'oi')`],
        ['apagar_nota', (sp) => sp`select public.apagar_nota(${nota!.id})`],
        [
          'criar_tarefa',
          (sp) =>
            sp`select public.criar_tarefa(${lead!.id}, 'Ligar', now() + interval '1 day', null, null, null)`,
        ],
        ['concluir_tarefa', (sp) => sp`select public.concluir_tarefa(${tarefa!.id})`],
        [
          'adiar_tarefa',
          (sp) => sp`select public.adiar_tarefa(${tarefa!.id}, now() + interval '2 days')`,
        ],
        [
          'registrar_contato',
          (sp) => sp`select public.registrar_contato(${lead!.id}, 'whatsapp', null)`,
        ],
        [
          'atualizar_dados_lead',
          (sp) => sp`select public.atualizar_dados_lead(${lead!.id}, 'Outro', null)`,
        ],
        ['marcar_perdido', (sp) => sp`select public.marcar_perdido(${lead!.id}, 'preco', null)`],
        [
          'definir_proximo_contato',
          (sp) => sp`select public.definir_proximo_contato(${lead!.id}, now() + interval '1 day')`,
        ],
        [
          'agendar_visita',
          (sp) => sp`select public.agendar_visita(${lead!.id}, now() + interval '3 days', null)`,
        ],
        [
          'criar_bloqueio',
          (sp) =>
            sp`select public.criar_bloqueio(${amanha}::date, ${amanha}::date, null, null, 'Reforma')`,
        ],
        [
          'estender_pre_reserva',
          (sp) => sp`select public.estender_pre_reserva(${reserva!.id}, 24)`,
        ],
        ['cancelar_reserva', (sp) => sp`select public.cancelar_reserva(${reserva!.id}, 'x')`],
        ['alterar_slug', (sp) => sp`select public.alterar_slug('buffet-demo-novo')`],
        ['avancar_onboarding', (sp) => sp`select public.avancar_onboarding(5::smallint)`],
        ['marcar_link_na_bio', (sp) => sp`select public.marcar_link_na_bio(true)`],
        ['marcar_link_testado', (sp) => sp`select public.marcar_link_testado()`],
        ['dispensar_checklist', (sp) => sp`select public.dispensar_checklist(true)`],
        [
          'salvar_regra_follow_up',
          (sp) => sp`select public.salvar_regra_follow_up('segundo_toque', false, 3)`,
        ],
        [
          'update direto (espacos)',
          (sp) => sp`update public.espacos set nome = 'X' where id = ${espaco!.id}`,
        ],
        [
          'update direto (empresas)',
          (sp) => sp`update public.empresas set nome = 'X' where id = ${empresa}`,
        ],
      ];
      await como(tx, IDS.donoA, async () => {
        for (const [nome, fn] of chamadas) {
          let erro: unknown;
          try {
            await tx.savepoint((sp) => fn(sp as unknown as Tx));
          } catch (e) {
            erro = e;
          }
          expect((erro as { message?: string } | undefined)?.message, nome).toBe(
            'CONTA_SOMENTE_LEITURA',
          );
        }
        // leitura continua
        expect((await tx`select id from public.leads limit 1`).length).toBe(1);
        // avisos e consentimento do suporte continuam
        await tx`select public.marcar_avisos_lidos(null)`;
        await tx`select public.permitir_suporte()`;
      });
      // servidor via admin (sem claims) e jobs seguem escrevendo
      await tx`update public.espacos set nome = 'Admin' where id = ${espaco!.id}`;
    });
  });
});

describe('acesso de suporte', () => {
  it('só o dono concede; expira, pode ser revogado e marca a auditoria', async () => {
    await emTransacao(sql, async (tx) => {
      const e = await novaEmpresa(tx);
      const vigente = async () => {
        const [l] = await tx`select public.suporte_vigente(${e.id}) as v`;
        return l!.v as Date | null;
      };
      expect(await vigente()).toBeNull();
      await como(tx, e.vendedor, () =>
        esperarErroSql(
          tx.savepoint((sp) => sp`select public.permitir_suporte()`),
          '42501',
        ),
      );
      await como(tx, e.dono, () => tx`select public.permitir_suporte()`);
      const v = await vigente();
      expect(v!.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
      await como(tx, e.dono, () => tx`select public.revogar_suporte()`);
      expect(await vigente()).toBeNull();
      // expira sozinho
      await como(tx, e.dono, () => tx`select public.permitir_suporte()`);
      await tx`update public.acessos_suporte set concedido_em = now() - interval '8 days',
        expira_em = now() - interval '1 day' where empresa_id = ${e.id} and revogado_em is null`;
      expect(await vigente()).toBeNull();
      const acoes = await tx`select acao from public.auditoria where empresa_id = ${e.id}
        and entidade = 'acesso_suporte' order by criado_em`;
      expect(acoes.map((a) => a.acao)).toEqual([
        'suporte.permitido',
        'suporte.revogado',
        'suporte.permitido',
      ]);

      // o que o suporte faz fica marcado
      const [lead] = await tx`insert into public.leads (empresa_id, nome, whatsapp_e164, origem)
        values (${e.id}, 'Cliente', '+5534990000003', 'link_direto') returning id`;
      await tx`select set_config('orkestra.suporte_admin', 'equipe@orkestra.app', true)`;
      await como(
        tx,
        e.dono,
        () => tx`select public.adicionar_nota(${lead!.id}, 'Ajuda do suporte')`,
      );
      await tx`select set_config('orkestra.suporte_admin', '', true)`;
      const [aud] = await tx`select dados from public.auditoria where empresa_id = ${e.id}
        and entidade_id is not null and acao like 'nota%' order by criado_em desc limit 1`;
      expect(aud!.dados).toMatchObject({ suporte: 'equipe@orkestra.app' });
    });
  });
});

describe('/interno', () => {
  it('estender teste, suspender, reativar e isentar, com auditoria interna', async () => {
    await emTransacao(sql, async (tx) => {
      const e = await novaEmpresa(tx, { trialDias: -1 });
      await tx`select public._atualizar_situacao(${e.id})`;
      expect(await plano(tx, e.id)).toBe('suspenso');
      await tx`select public.interno_estender_teste(${e.id}, 7, 'Admin@Orkestra.app')`;
      expect(await plano(tx, e.id)).toBe('trial');
      await tx`select public.interno_suspender(${e.id}, 'fraude', 'admin@orkestra.app')`;
      expect(await plano(tx, e.id)).toBe('suspenso');
      await tx`select public.interno_reativar(${e.id}, 'admin@orkestra.app')`;
      expect(await plano(tx, e.id)).toBe('trial');
      await tx`select public.interno_isentar(${e.id}, true, 'admin@orkestra.app')`;
      expect(await plano(tx, e.id)).toBe('ativo');
      const log =
        await tx`select admin_email, acao from public.auditoria_interna where empresa_id = ${e.id} order by criado_em`;
      expect(log).toEqual([
        { admin_email: 'admin@orkestra.app', acao: 'teste.estendido' },
        { admin_email: 'admin@orkestra.app', acao: 'empresa.suspensa' },
        { admin_email: 'admin@orkestra.app', acao: 'empresa.reativada' },
        { admin_email: 'admin@orkestra.app', acao: 'empresa.isenta' },
      ]);
    });
  });

  it('funções internas e de cobrança não são executáveis pelo painel nem pelo link', async () => {
    for (const papel of ['authenticated', 'anon']) {
      const [l] =
        await sql`select bool_or(has_function_privilege(${papel}, p.oid, 'execute')) as algum
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.proname like 'interno\\_%' or p.proname like 'cobranca\\_%'
          or p.proname in ('atualizar_situacoes', '_atualizar_situacao', 'suporte_vigente'))`;
      expect(l!.algum, papel).toBe(false);
    }
  });
});

describe('link público de empresa suspensa', () => {
  it('vitrine responde; contexto do wizard continua recusado', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`update public.empresas set plano = 'suspenso' where id = ${IDS.empresaA}`;
      await comoAnon(tx, async () => {
        const [v] = await tx`select publico.contexto_vitrine('buffet-demo') as c`;
        expect((v!.c as { pacotes: unknown[] }).pacotes.length).toBeGreaterThan(0);
        await esperarErroSql(
          tx.savepoint((sp) => sp`select publico.contexto_preco('buffet-demo')`),
          '42501',
        );
      });
      await comoAnon(tx, () =>
        esperarErroSql(
          tx.savepoint((sp) => sp`select publico.contexto_vitrine('nao-existe')`),
          'P0002',
        ),
      );
    });
  });
});

describe('isolamento das tabelas novas', () => {
  it('dono lê só a própria empresa; vendedor não lê cobrança; painel não lê cupons nem eventos', async () => {
    await emTransacao(sql, async (tx) => {
      const a = await novaEmpresa(tx);
      const b = await novaEmpresa(tx);
      const ass = await novaAssinatura(tx, a.id);
      await tx`insert into public.empresas_cobranca (empresa_id, nome, documento, email)
        values (${a.id}, 'Fulana', '52998224725', 'f@x.com')`;
      await registrar(
        tx,
        evento({
          tipo: 'PAYMENT_CREATED',
          cobranca: {
            asaas_id: 'pay_iso',
            assinatura_asaas_id: ass.asaas,
            valor_centavos: 9700,
            vencimento: '2026-11-10',
            status: 'pendente',
          },
        }),
      );
      await como(tx, a.dono, () => tx`select public.permitir_suporte()`);
      const ler = (u: string) =>
        como(tx, u, async () => ({
          assinaturas: (await tx`select id from public.assinaturas`).length,
          cobrancas: (await tx`select id from public.cobrancas`).length,
          dados: (await tx`select empresa_id from public.empresas_cobranca`).length,
          suporte: (await tx`select id from public.acessos_suporte`).length,
          planos: (await tx`select codigo from public.planos`).length,
        }));
      expect(await ler(a.dono)).toEqual({
        assinaturas: 1,
        cobrancas: 1,
        dados: 1,
        suporte: 1,
        planos: 2,
      });
      expect(await ler(a.vendedor)).toEqual({
        assinaturas: 0,
        cobrancas: 0,
        dados: 0,
        suporte: 0,
        planos: 2,
      });
      expect(await ler(b.dono)).toEqual({
        assinaturas: 0,
        cobrancas: 0,
        dados: 0,
        suporte: 0,
        planos: 2,
      });
      for (const t of ['cupons', 'cupons_usos', 'cobranca_eventos', 'auditoria_interna']) {
        await como(tx, a.dono, () =>
          esperarErroSql(
            tx.savepoint((sp) => sp.unsafe(`select 1 from public.${t}`)),
            '42501',
          ),
        );
      }
      // ninguém escreve pela API
      await como(tx, a.dono, () =>
        esperarErroSql(
          tx.savepoint(
            (sp) => sp`update public.assinaturas set valor_centavos = 1 where id = ${ass.id}`,
          ),
          '42501',
        ),
      );
    });
  });
});

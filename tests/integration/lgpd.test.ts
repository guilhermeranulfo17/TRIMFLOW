import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { criarDb } from '@/server/db/client';
import { criarComUsuario } from '@/server/db/tenant';
import { processarExclusoes } from '@/server/lgpd/exclusao';
import { arquivosDaEmpresa, TABELAS_EXPORTACAO } from '@/server/lgpd/exportar';
import { assumirUsuario, conectar, emTransacao, IDS, urlBancoTeste } from '../support/db';
import { criarEmpresaTemporaria, removerEmpresa } from '../support/empresa-temporaria';
import { cenarioPublico, dataDaqui, salvarInterno } from '../support/publico';

/*
 * Etapa 9B · B.1 LGPD: anonimização sem rastro, exportações sem dado de outra empresa, retenção
 * só de quem deve, exclusão da conta com 30 dias (Storage e Auth) e auditoria só para o dono.
 */

const sql = conectar();
const { db, sql: sqlDb } = criarDb(urlBancoTeste(), { max: 2 });
const comUsuario = criarComUsuario(db);
afterAll(async () => {
  await sql.end();
  await sqlDb.end();
});

type Tx = postgres.TransactionSql;

async function como<T>(tx: Tx, usuario: string, fn: () => Promise<T>): Promise<T> {
  await assumirUsuario(tx, usuario);
  try {
    return await fn();
  } finally {
    await tx`reset role`;
    await tx`select set_config('request.jwt.claims', '', true)`;
  }
}

/** Mensagem do erro da consulta, num savepoint (a transação do teste continua usável). */
async function erroDe(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<string> {
  try {
    await tx.savepoint((sp) => fn(sp as unknown as Tx));
  } catch (e) {
    const err = e as { message?: string; code?: string };
    return `${err.code}:${err.message}`;
  }
  return 'sem erro';
}

/** Linhas de qualquer tabela (public e publico) que ainda tenham algum dos textos. */
async function procurarNoBanco(tx: Tx, textos: string[], digitos: string) {
  const tabelas = await tx`select table_schema || '.' || table_name as t
    from information_schema.tables
    where table_schema in ('public', 'publico') and table_type = 'BASE TABLE'`;
  const achados: string[] = [];
  for (const { t } of tabelas) {
    const [r] = await tx.unsafe(
      `select count(*)::int as n from ${t} x
       where x::text ilike any($1) or regexp_replace(x::text, '\\D', '', 'g') like $2`,
      [textos.map((s) => `%${s}%`), `%${digitos}%`],
    );
    if (r!.n > 0) achados.push(`${t}: ${r!.n}`);
  }
  return achados;
}

describe('apagar a pedido do titular', () => {
  it('nome, WhatsApp e textos somem de todo o banco; Números não muda', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 40);
      const NOME = 'Zuleica Quaresmal Teixeirinha';
      const WPP = '+5534987651234';
      const de = await dataDaqui(tx, -90);
      const ate = await dataDaqui(tx, 1);

      const antes = await como(tx, IDS.donoA, async () => {
        const o = await salvarInterno(tx, c, {
          nome: NOME,
          whatsapp: WPP,
          data,
          observacoes: 'Ligar para Zuleica à tarde',
          observacoesInternas: 'Zuleica pediu desconto',
          descontoMotivo: 'Indicada pela Quaresmal',
        });
        await tx`select public.adicionar_nota(${o.lead_id}, 'Zuleica prefere tarde: 34 98765-1234')`;
        await tx`select public.criar_tarefa(${o.lead_id}, 'Ligar para Zuleica Quaresmal',
          now() + interval '1 day', 'falar com Zuleica')`;
        await tx`select public.registrar_contato(${o.lead_id}, 'whatsapp', 'Falei com Zuleica')`;
        await tx`select public.agendar_visita(${o.lead_id}, now() + interval '3 days',
          'Zuleica vem com o marido')`;
        const [n] = await tx`select public.numeros(${de}::date, ${ate}::date) as j`;
        return { numeros: n!.j, lead: o.lead_id as string };
      });

      // antes: o nome está espalhado pelo banco
      expect(
        (await procurarNoBanco(tx, ['zuleica', 'quaresmal', 'teixeirinha'], '987651234')).length,
      ).toBeGreaterThan(3);

      await como(tx, IDS.donoA, async () => {
        const [r] = await tx`select public.lgpd_apagar_lead(${antes.lead}) as ok`;
        expect(r!.ok).toBe(true);
        // de novo: nada a fazer
        const [r2] = await tx`select public.lgpd_apagar_lead(${antes.lead}) as ok`;
        expect(r2!.ok).toBe(false);
      });

      expect(
        await procurarNoBanco(tx, ['zuleica', 'quaresmal', 'teixeirinha'], '987651234'),
      ).toEqual([]);

      const [lead] =
        await tx`select nome, whatsapp_e164, email, anonimizado_em, titular_hash, status
        from public.leads where id = ${antes.lead}`;
      expect(lead!.nome).toBe('Titular removido');
      expect(lead!.whatsapp_e164).toBeNull();
      expect(lead!.anonimizado_em).not.toBeNull();
      expect(lead!.titular_hash).toMatch(/^[0-9a-f]{64}$/);
      const [aud] = await tx`select dados from public.auditoria
        where entidade_id = ${antes.lead} and acao = 'lead.anonimizado'`;
      expect(aud!.dados).toEqual({ motivo: 'pedido_titular' });

      // Números: exatamente iguais antes e depois (o lead continua contando)
      await como(tx, IDS.donoA, async () => {
        const [n] = await tx`select public.numeros(${de}::date, ${ate}::date) as j`;
        expect(n!.j).toEqual(antes.numeros);
      });
    });
  });

  it('pré-reserva ativa é cancelada (a data fica livre)', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 45);
      await como(tx, IDS.donoA, async () => {
        const o = await salvarInterno(tx, c, {
          nome: 'Pessoa Pre',
          whatsapp: '+5534987650000',
          data,
        });
        await tx`select public.pre_reservar_orcamento(${o.id})`;
        const [ativa] = await tx`select count(*)::int as n from public.reservas
          where lead_id = ${o.lead_id} and status = 'ativa'`;
        expect(ativa!.n).toBe(1);
        await tx`select public.lgpd_apagar_lead(${o.lead_id})`;
        const [depois] = await tx`select count(*)::int as n from public.reservas
          where lead_id = ${o.lead_id} and status = 'ativa'`;
        expect(depois!.n).toBe(0);
      });
    });
  });

  it('reserva confirmada de festa futura bloqueia; vendedor e outra empresa não podem', async () => {
    await emTransacao(sql, async (tx) => {
      const [marcos] = await tx`select l.id from public.leads l
        join public.reservas r on r.lead_id = l.id
        where l.empresa_id = ${IDS.empresaA} and r.tipo = 'confirmada' and r.status = 'ativa'
          and r.data >= current_date limit 1`;
      await como(tx, IDS.donoA, async () => {
        expect(
          await erroDe(tx, (sp) => sp`select public.lgpd_apagar_lead(${marcos!.id})`),
        ).toContain('LGPD_RESERVA_FUTURA');
      });
      await como(tx, IDS.vendedorA, async () => {
        expect(
          await erroDe(tx, (sp) => sp`select public.lgpd_apagar_lead(${marcos!.id})`),
        ).toContain('42501');
      });
      await como(tx, IDS.donoB, async () => {
        expect(
          await erroDe(tx, (sp) => sp`select public.lgpd_apagar_lead(${marcos!.id})`),
        ).toContain('LEAD_NAO_ENCONTRADO');
      });
    });
  });
});

describe('exportação', () => {
  it('do lead: dados, orçamentos, reservas e histórico; só para o dono da empresa', async () => {
    await emTransacao(sql, async (tx) => {
      const [lead] = await tx`select l.id from public.leads l
        join public.reservas r on r.lead_id = l.id
        where l.empresa_id = ${IDS.empresaA} and r.tipo = 'confirmada' limit 1`;
      await como(tx, IDS.donoA, async () => {
        const [r] = await tx`select public.lgpd_exportar_lead(${lead!.id}) as j`;
        const j = r!.j as Record<string, unknown[]> & { lead: Record<string, unknown> };
        expect(j.lead.id).toBe(lead!.id);
        expect(j.lead).not.toHaveProperty('empresa_id');
        expect(j.orcamentos!.length).toBeGreaterThan(0);
        expect(j.reservas!.length).toBeGreaterThan(0);
        expect(j.atividades!.length).toBeGreaterThan(0);
        expect(j).toHaveProperty('visitas');
        expect(j).toHaveProperty('notas');
        const [aud] = await tx`select count(*)::int as n from public.auditoria
          where entidade_id = ${lead!.id} and acao = 'lead.exportado'`;
        expect(aud!.n).toBe(1);
      });
      await como(tx, IDS.donoB, async () => {
        expect(
          await erroDe(tx, (sp) => sp`select public.lgpd_exportar_lead(${lead!.id})`),
        ).toContain('LEAD_NAO_ENCONTRADO');
      });
      await como(tx, IDS.vendedorA, async () => {
        expect(
          await erroDe(tx, (sp) => sp`select public.lgpd_exportar_lead(${lead!.id})`),
        ).toContain('42501');
      });
    });
  });

  it('da empresa: um CSV por tabela, sem nenhum dado de outra empresa', async () => {
    const arquivos = await comUsuario(IDS.donoA, (tx) => arquivosDaEmpresa(tx));
    const nomes = arquivos.map((a) => a.nome);
    expect(nomes).toContain('LEIA-ME.txt');
    for (const { tabela } of TABELAS_EXPORTACAO) expect(nomes).toContain(`${tabela}.csv`);
    const tudo = arquivos.map((a) => String(a.conteudo)).join('\n');
    expect(tudo).toContain(IDS.empresaA);
    expect(tudo).not.toContain(IDS.empresaB);
    expect(tudo).not.toContain(IDS.donoB);
    const leadsB = await sql`select id, nome from public.leads where empresa_id = ${IDS.empresaB}`;
    for (const l of leadsB) expect(tudo).not.toContain(l.id as string);
    const leadsA = arquivos.find((a) => a.nome === 'leads.csv')!.conteudo as string;
    expect(leadsA.split('\r\n').length).toBeGreaterThan(20);
    expect(leadsA).not.toContain('titular_hash');
  });
});

describe('retenção (job diário)', () => {
  it('anonimiza só lead real sem reserva e parado além do prazo; apaga teste com mais de 30 dias', async () => {
    await emTransacao(sql, async (tx) => {
      const empresa = IDS.empresaA;
      const mk = async (nome: string, wpp: string, teste: boolean, diasParado: number) => {
        const [l] = await tx`insert into public.leads (empresa_id, nome, whatsapp_e164, eh_teste,
            ultima_atividade_em, criado_em)
          values (${empresa}, ${nome}, ${wpp}, ${teste}, now() - make_interval(days => ${diasParado}),
            now() - make_interval(days => ${diasParado}))
          returning id`;
        return l!.id as string;
      };
      const velho = await mk('Velho Sem Reserva', '+5534900000001', false, 800);
      const recente = await mk('Recente', '+5534900000002', false, 100);
      const velhoComReserva = await mk('Velho Com Reserva', '+5534900000003', false, 800);
      const testeVelho = await mk('Teste Velho', '+5534900000004', true, 40);
      const testeNovo = await mk('Teste Novo', '+5534900000005', true, 5);
      const [r] = await tx`select id, espaco_id, turno_id from public.reservas
        where empresa_id = ${empresa} and tipo = 'confirmada' limit 1`;
      await tx`update public.reservas set lead_id = ${velhoComReserva}, status = 'realizada'
        where id = ${r!.id}`;
      // prazo de 24 meses (padrão)
      const [res] = await tx`select public.lgpd_retencao(now()) as j`;
      expect((res!.j as { leads_anonimizados: number }).leads_anonimizados).toBeGreaterThanOrEqual(
        1,
      );

      const estado = async (id: string) =>
        (await tx`select nome, anonimizado_em from public.leads where id = ${id}`)[0];
      expect((await estado(velho))!.nome).toBe('Titular removido');
      expect((await estado(recente))!.anonimizado_em).toBeNull();
      expect((await estado(velhoComReserva))!.anonimizado_em).toBeNull();
      expect(await estado(testeVelho)).toBeUndefined();
      expect(await estado(testeNovo)).toBeDefined();

      // prazo de 60 meses: o mesmo lead parado há 800 dias ficaria
      const outro = await mk('Velho 60 Meses', '+5534900000006', false, 800);
      await tx`update public.empresas set retencao_leads_meses = 60 where id = ${empresa}`;
      await tx`select public.lgpd_retencao(now())`;
      expect((await estado(outro))!.anonimizado_em).toBeNull();
    });
  });

  it('o dono escolhe o prazo; valor fora da lista é recusado', async () => {
    await emTransacao(sql, async (tx) => {
      await como(tx, IDS.donoA, async () => {
        await tx`select public.salvar_retencao_leads(36)`;
        expect(await erroDe(tx, (sp) => sp`select public.salvar_retencao_leads(7)`)).toContain(
          'RETENCAO_INVALIDA',
        );
      });
      const [e] =
        await tx`select retencao_leads_meses from public.empresas where id = ${IDS.empresaA}`;
      expect(e!.retencao_leads_meses).toBe(36);
      await como(tx, IDS.vendedorA, async () => {
        expect(await erroDe(tx, (sp) => sp`select public.salvar_retencao_leads(12)`)).toContain(
          '42501',
        );
      });
    });
  });
});

describe('exclusão da conta', () => {
  it('suspende na hora, respeita os 30 dias e depois apaga Storage, Auth e banco', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    try {
      await sql.begin(async (tx) => {
        await assumirUsuario(tx, e.donoId);
        await tx`select public.solicitar_exclusao_conta()`;
      });
      const [emp] = await sql`select plano, exclusao_agendada_para - now() as falta
        from public.empresas where id = ${e.empresaId}`;
      expect(emp!.plano).toBe('suspenso');

      const removidos: string[] = [];
      const apagados: string[] = [];
      const arquivos = [`${e.empresaId}/logo/a.webp`, `${e.empresaId}/galeria/b-640.webp`];
      const deps = (dias: number) => ({
        db,
        agora: () => new Date(Date.now() + dias * 86_400_000),
        storage: {
          listar: async (b: string, prefixo: string) =>
            b === 'midia' ? arquivos.filter((a) => a.startsWith(prefixo)) : [],
          remover: async (_b: string, caminhos: string[]) => void removidos.push(...caminhos),
        },
        auth: { apagarUsuario: async (id: string) => void apagados.push(id) },
      });

      const cedo = await processarExclusoes(deps(29));
      expect(cedo.excluidas).not.toContain(e.empresaId);
      expect(removidos).toEqual([]);

      const depois = await processarExclusoes(deps(31));
      expect(depois.excluidas).toContain(e.empresaId);
      expect(removidos.sort()).toEqual([...arquivos].sort());
      expect(apagados.sort()).toEqual([e.donoId, e.vendedorId].sort());
      const [n] =
        await sql`select count(*)::int as n from public.empresas where id = ${e.empresaId}`;
      expect(n!.n).toBe(0);
      const [u] =
        await sql`select count(*)::int as n from public.usuarios where empresa_id = ${e.empresaId}`;
      expect(u!.n).toBe(0);
    } finally {
      await sql`delete from public.usuarios where empresa_id = ${e.empresaId}`;
      await sql`delete from public.empresas where id = ${e.empresaId}`;
      await sql`delete from auth.users where id in ${sql([e.donoId, e.vendedorId])}`;
    }
  });

  it('o banco recusa excluir antes do prazo; desistir reativa a conta', async () => {
    const e = await criarEmpresaTemporaria(sql, 'eventos');
    try {
      await sql.begin(async (tx) => {
        await assumirUsuario(tx, e.donoId);
        await tx`select public.solicitar_exclusao_conta()`;
      });
      await expect(sql`select public.lgpd_excluir_empresa(${e.empresaId}::uuid)`).rejects.toThrow(
        'EXCLUSAO_FORA_DO_PRAZO',
      );
      await sql.begin(async (tx) => {
        await assumirUsuario(tx, e.donoId);
        await tx`select public.desistir_exclusao_conta()`;
      });
      const [emp] = await sql`select plano, exclusao_agendada_para, suspensa_manual_em
        from public.empresas where id = ${e.empresaId}`;
      expect(emp!.exclusao_agendada_para).toBeNull();
      expect(emp!.suspensa_manual_em).toBeNull();
      expect(emp!.plano).toBe('suspenso'); // sem teste nem assinatura nesta empresa temporária
      // vendedor não pede exclusão
      await sql.begin(async (tx) => {
        await assumirUsuario(tx, e.vendedorId);
        expect(await erroDe(tx, (sp) => sp`select public.solicitar_exclusao_conta()`)).toContain(
          '42501',
        );
      });
    } finally {
      await removerEmpresa(sql, e);
    }
  });
});

describe('aceite versionado e auditoria', () => {
  it('registra versão e data (histórico) e recusa versão malformada', async () => {
    await emTransacao(sql, async (tx) => {
      await como(tx, IDS.donoA, async () => {
        await tx`select public.registrar_aceite('2099-01-01')`;
        expect(await erroDe(tx, (sp) => sp`select public.registrar_aceite('qualquer')`)).toContain(
          'VERSAO_INVALIDA',
        );
      });
      const [u] = await tx`select termos_versao, termos_aceitos_em from public.usuarios
        where id = ${IDS.donoA}`;
      expect(u!.termos_versao).toBe('2099-01-01');
      const [h] = await tx`select count(*)::int as n from public.aceites_termos
        where usuario_id = ${IDS.donoA} and versao = '2099-01-01'`;
      expect(h!.n).toBe(1);
    });
  });

  it('auditoria: o dono lê, o vendedor não', async () => {
    await emTransacao(sql, async (tx) => {
      const dono = await como(
        tx,
        IDS.donoA,
        () => tx`select count(*)::int as n from public.auditoria`,
      );
      const vendedor = await como(
        tx,
        IDS.vendedorA,
        () => tx`select count(*)::int as n from public.auditoria`,
      );
      expect(dono[0]!.n).toBeGreaterThan(0);
      expect(vendedor[0]!.n).toBe(0);
    });
  });
});

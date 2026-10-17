import { afterAll, describe, expect, it } from 'vitest';
import {
  assumirAnon,
  comoUsuario,
  conectar,
  emTransacao,
  esperarErroSql,
  IDS,
} from '../support/db';

/*
 * Etapa 14 (Vendas Orkestra): as tabelas do CRM interno ficam fora do alcance dos buffets.
 * Nenhum usuário do painel (dono ou vendedor) nem o anon lê ou escreve; só a conexão
 * administrativa do /interno.
 */

const sql = conectar();
afterAll(() => sql.end());

const TABELAS = [
  'vendas_leads',
  'vendas_sugestoes',
  'vendas_mensagens',
  'vendas_movimentos',
  'vendas_conhecimento',
  'vendas_exemplos',
];

describe('Vendas Orkestra: isolamento dos buffets', () => {
  for (const tabela of TABELAS) {
    for (const [quem, id] of [
      ['dono', IDS.donoA],
      ['vendedor', IDS.vendedorA],
    ] as const) {
      it(`${quem} de buffet não lê ${tabela}`, async () => {
        await comoUsuario(sql, id, (tx) =>
          esperarErroSql(tx`select * from ${tx('public.' + tabela)}`, '42501'),
        );
      });
    }

    it(`anon não lê ${tabela}`, async () => {
      await emTransacao(sql, async (tx) => {
        await assumirAnon(tx);
        await esperarErroSql(tx`select * from ${tx('public.' + tabela)}`, '42501');
      });
    });
  }

  it('dono de buffet não cadastra lead de vendas', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(tx`insert into public.vendas_leads (nome) values ('Invasor')`, '42501'),
    );
  });

  it('nenhuma tabela de vendas tem empresa_id (não é dado de buffet)', async () => {
    const linhas = await sql`select table_name from information_schema.columns
      where table_schema = 'public' and table_name like 'vendas\\_%' and column_name = 'empresa_id'`;
    expect(linhas).toEqual([]);
  });
});

describe('Vendas Orkestra: conexão administrativa', () => {
  it('cadastra lead com etapa Novo e registra movimento', async () => {
    await emTransacao(sql, async (tx) => {
      const [lead] = await tx`insert into public.vendas_leads (nome, buffet, telefone_e164)
        values ('Ana', 'Buffet Alegria', '+5534999990001') returning id, etapa, tentativas`;
      expect(lead!.etapa).toBe('novo');
      expect(lead!.tentativas).toBe(0);
      await tx`insert into public.vendas_movimentos (lead_id, de, para, origem, motivo)
        values (${lead!.id}, 'novo', 'abordado', 'manual', 'Primeira mensagem enviada')`;
      const movs = await tx`select para from public.vendas_movimentos where lead_id = ${lead!.id}`;
      expect(movs.map((m) => m.para)).toEqual(['abordado']);
    });
  });

  it('recusa telefone repetido', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`insert into public.vendas_leads (nome, telefone_e164) values ('Ana', '+5534999990002')`;
      await esperarErroSql(
        tx`insert into public.vendas_leads (nome, telefone_e164) values ('Bia', '+5534999990002')`,
        '23505',
      );
    });
  });

  it('recusa movimento para a mesma etapa', async () => {
    await emTransacao(sql, async (tx) => {
      const [lead] = await tx`insert into public.vendas_leads (nome) values ('Ana') returning id`;
      await esperarErroSql(
        tx`insert into public.vendas_movimentos (lead_id, de, para, origem)
          values (${lead!.id}, 'novo', 'novo', 'manual')`,
        '23514',
      );
    });
  });

  it('sugestão aprovada exige mensagem final e data da decisão', async () => {
    await emTransacao(sql, async (tx) => {
      const [lead] = await tx`insert into public.vendas_leads (nome) values ('Ana') returning id`;
      await esperarErroSql(
        tx`insert into public.vendas_sugestoes
            (lead_id, entrada, saida, mensagem_sugerida, status, decidido_em,
             prompt_versao, provedor, modelo)
          values (${lead!.id}, 'oi', '{}'::jsonb, 'Oi!', 'aprovada', now(), 'v1', 'gemini', 'teste')`,
        '23514',
      );
    });
  });

  it('apagar o lead apaga conversa, sugestões e exemplos', async () => {
    await emTransacao(sql, async (tx) => {
      const [lead] = await tx`insert into public.vendas_leads (nome) values ('Ana') returning id`;
      const [sug] = await tx`insert into public.vendas_sugestoes
          (lead_id, entrada, saida, mensagem_sugerida, prompt_versao, provedor, modelo)
        values (${lead!.id}, 'oi', '{}'::jsonb, 'Oi!', 'v1', 'gemini', 'teste') returning id`;
      await tx`insert into public.vendas_mensagens (lead_id, autor, texto, sugestao_id)
        values (${lead!.id}, 'gui', 'Oi!', ${sug!.id})`;
      await tx`insert into public.vendas_exemplos (sugestao_id, avaliacao, motivo)
        values (${sug!.id}, 'boa', 'Curta e direta')`;
      await tx`delete from public.vendas_leads where id = ${lead!.id}`;
      const [r] = await tx`select
        (select count(*) from public.vendas_sugestoes where lead_id = ${lead!.id})::int as s,
        (select count(*) from public.vendas_mensagens where lead_id = ${lead!.id})::int as m,
        (select count(*) from public.vendas_exemplos where sugestao_id = ${sug!.id})::int as e`;
      expect(r).toEqual({ s: 0, m: 0, e: 0 });
    });
  });
});

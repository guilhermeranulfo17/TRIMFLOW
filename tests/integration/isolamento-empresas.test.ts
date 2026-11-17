import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { assumirAnon, assumirUsuario, conectar, emTransacao, IDS } from '../support/db';

/*
 * Item 3 da análise de 17/11/2026 (§99): prova, de forma sistemática, que uma empresa não lê nem
 * escreve dados de outra, nem o anon. Varre TODA tabela com empresa_id (nova tabela entra sozinha)
 * e chama as funções do painel (SECURITY DEFINER) do dono B com ids da empresa A, conferindo que
 * nada de A muda. Tudo em transação desfeita no fim.
 */

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;

async function tabelasComEmpresa(tx: Tx | postgres.Sql) {
  const ts = await tx<{ esquema: string; tabela: string }[]>`
    select c.table_schema as esquema, c.table_name as tabela
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema in ('public', 'publico') and c.column_name = 'empresa_id'
    order by 1, 2`;
  return ts.map((t) => `${t.esquema}.${t.tabela}`);
}

/** Impressão digital de todas as linhas de A em todas as tabelas com empresa_id (como postgres). */
async function digitalDeA(tx: Tx): Promise<string> {
  const partes: string[] = [];
  for (const t of await tabelasComEmpresa(tx)) {
    const [r] = await tx.unsafe(
      `select coalesce(md5(string_agg(x::text, '|' order by x::text)), '-') as h
       from ${t} x where x.empresa_id = $1`,
      [IDS.empresaA],
    );
    partes.push(`${t}:${r!.h}`);
  }
  return partes.join(',');
}

async function tentar(
  tx: Tx,
  fn: () => Promise<unknown>,
): Promise<{ erro: string | null; r: unknown }> {
  try {
    let r: unknown;
    await tx.savepoint(async (sp) => {
      r = await fn.call(sp);
    });
    return { erro: null, r };
  } catch (e) {
    return { erro: (e as { code?: string }).code ?? 'erro', r: null };
  }
}

describe('isolamento entre empresas: todas as tabelas com empresa_id', () => {
  it('dono B não lê nenhuma linha de A; anon não lê nada', async () => {
    const tabelas = await tabelasComEmpresa(sql);
    expect(tabelas.length).toBeGreaterThan(40);
    const vazou: string[] = [];
    for (const t of tabelas) {
      await emTransacao(sql, async (tx) => {
        await assumirUsuario(tx, IDS.donoB);
        const r = await tentar(tx, () =>
          tx.unsafe(`select count(*)::int as n from ${t} where empresa_id = $1`, [IDS.empresaA]),
        );
        const n = r.erro ? 0 : (r.r as { n: number }[])[0]!.n;
        if (n > 0) vazou.push(`B lê ${t}`);
        await tx`reset role`;
        await assumirAnon(tx);
        const a = await tentar(tx, () => tx.unsafe(`select count(*)::int as n from ${t}`));
        if (!a.erro && (a.r as { n: number }[])[0]!.n > 0) vazou.push(`anon lê ${t}`);
      });
    }
    expect(vazou).toEqual([]);
  });

  it('dono B não altera, apaga nem insere linha de A em nenhuma tabela', async () => {
    const tabelas = await tabelasComEmpresa(sql);
    const escreveu: string[] = [];
    for (const t of tabelas) {
      await emTransacao(sql, async (tx) => {
        const antes = await tx.unsafe(`select count(*)::int as n from ${t} where empresa_id = $1`, [
          IDS.empresaA,
        ]);
        // cópia de uma linha de A com id novo, para tentar inserir como B
        await tx.unsafe(`create temp table copia on commit drop as
          select * from ${t} where empresa_id = '${IDS.empresaA}' limit 1`);
        const temId = await tx`select 1 from information_schema.columns
          where table_schema = ${t.split('.')[0]!} and table_name = ${t.split('.')[1]!}
            and column_name = 'id' and data_type = 'uuid'`;
        if (temId.length) await tx.unsafe(`update copia set id = '${randomUUID()}'`);
        await tx`grant select on copia to authenticated`;

        await assumirUsuario(tx, IDS.donoB);
        const up = await tentar(tx, () =>
          tx.unsafe(`update ${t} set empresa_id = empresa_id where empresa_id = $1`, [
            IDS.empresaA,
          ]),
        );
        if (!up.erro && (up.r as { count: number }).count > 0) escreveu.push(`update ${t}`);
        const del = await tentar(tx, () =>
          tx.unsafe(`delete from ${t} where empresa_id = $1`, [IDS.empresaA]),
        );
        if (!del.erro && (del.r as { count: number }).count > 0) escreveu.push(`delete ${t}`);
        const ins = await tentar(tx, () => tx.unsafe(`insert into ${t} select * from copia`));
        if (!ins.erro && (ins.r as { count: number }).count > 0) escreveu.push(`insert ${t}`);
        await tx`reset role`;

        const depois = await tx.unsafe(
          `select count(*)::int as n from ${t} where empresa_id = $1`,
          [IDS.empresaA],
        );
        if (antes[0]!.n !== depois[0]!.n) escreveu.push(`contagem ${t}`);
      });
    }
    expect(escreveu).toEqual([]);
  });
});

describe('isolamento entre empresas: funções do painel chamadas com ids de outra empresa', () => {
  it('nenhuma função do dono B muda dados de A nem devolve dados de A', async () => {
    await emTransacao(sql, async (tx) => {
      const um = async (q: Promise<postgres.Row[]>) => ((await q)[0]?.id as string) ?? randomUUID();
      const a = IDS.empresaA;
      const ids = {
        lead: await um(
          tx`select id from public.leads where empresa_id = ${a} and not eh_teste limit 1`,
        ),
        tarefa: await um(tx`select id from public.tarefas where empresa_id = ${a} limit 1`),
        nota: await um(tx`select id from public.notas where empresa_id = ${a} limit 1`),
        visita: await um(tx`select id from public.visitas where empresa_id = ${a} limit 1`),
        orcamento: await um(tx`select id from public.orcamentos where empresa_id = ${a} limit 1`),
        reserva: await um(
          tx`select id from public.reservas where empresa_id = ${a} and status = 'ativa' limit 1`,
        ),
        pre: await um(
          tx`select id from public.reservas where empresa_id = ${a} and tipo = 'pre_reserva' limit 1`,
        ),
        bloqueio: await um(tx`select id from public.bloqueios where empresa_id = ${a} limit 1`),
        pacote: await um(tx`select id from public.pacotes where empresa_id = ${a} limit 1`),
        aviso: await um(tx`select id from public.avisos where empresa_id = ${a} limit 1`),
        // o seed não tem contrato nem recebimento em A: id inexistente também precisa falhar
        contrato: await um(tx`select id from public.contratos where empresa_id = ${a} limit 1`),
        recebimento: await um(
          tx`select id from public.recebimentos where empresa_id = ${a} limit 1`,
        ),
      };
      const antes = await digitalDeA(tx);

      const chamadas: [string, () => Promise<postgres.Row[]>][] = [
        [
          'adiar_tarefa',
          () => tx`select public.adiar_tarefa(${ids.tarefa}, now() + interval '1 day')`,
        ],
        ['adicionar_nota', () => tx`select public.adicionar_nota(${ids.lead}, 'invasão')`],
        [
          'agendar_mensagem',
          () =>
            tx`select public.agendar_mensagem(${ids.lead}, 'x', now() + interval '1 day', 'm', null)`,
        ],
        [
          'agendar_visita',
          () => tx`select public.agendar_visita(${ids.lead}, now() + interval '2 days', null)`,
        ],
        ['apagar_nota', () => tx`select public.apagar_nota(${ids.nota})`],
        ['editar_nota', () => tx`select public.editar_nota(${ids.nota}, 'invasão')`],
        [
          'atribuir_responsavel',
          () => tx`select public.atribuir_responsavel(${ids.lead}, ${IDS.donoB})`,
        ],
        [
          'atualizar_dados_lead',
          () => tx`select public.atualizar_dados_lead(${ids.lead}, 'Invasor', null)`,
        ],
        ['cancelar_contrato', () => tx`select public.cancelar_contrato(${ids.contrato}, 'x')`],
        ['cancelar_reserva', () => tx`select public.cancelar_reserva(${ids.reserva}, 'x')`],
        ['confirmar_reserva', () => tx`select public.confirmar_reserva(${ids.pre}, 0, null)`],
        ['estender_pre_reserva', () => tx`select public.estender_pre_reserva(${ids.pre}, 2)`],
        ['cancelar_tarefa', () => tx`select public.cancelar_tarefa(${ids.tarefa})`],
        ['concluir_tarefa', () => tx`select public.concluir_tarefa(${ids.tarefa})`],
        ['reabrir_tarefa', () => tx`select public.reabrir_tarefa(${ids.tarefa})`],
        ['cancelar_visita', () => tx`select public.cancelar_visita(${ids.visita}, 'x')`],
        ['confirmar_visita', () => tx`select public.confirmar_visita(${ids.visita}, null)`],
        ['marcar_visita_realizada', () => tx`select public.marcar_visita_realizada(${ids.visita})`],
        [
          'remarcar_visita',
          () => tx`select public.remarcar_visita(${ids.visita}, now() + interval '3 days')`,
        ],
        ['contrato_comprovante', () => tx`select public.contrato_comprovante(${ids.contrato})`],
        ['contrato_marcar_pdf', () => tx`select public.contrato_marcar_pdf(${ids.contrato})`],
        ['ler_cpf_contrato', () => tx`select public.ler_cpf_contrato(${ids.contrato})`],
        [
          'novo_link_contrato',
          () => tx`select public.novo_link_contrato(${ids.contrato}, ${'h'.repeat(64)}, 7)`,
        ],
        [
          'criar_tarefa',
          () =>
            tx`select public.criar_tarefa(${ids.lead}, 'x', now() + interval '1 day', null, null, null)`,
        ],
        [
          'definir_proximo_contato',
          () => tx`select public.definir_proximo_contato(${ids.lead}, now() + interval '1 day')`,
        ],
        [
          'disponibilidade',
          () =>
            tx`select * from public.disponibilidade(${a}, current_date, current_date + 7, null)`,
        ],
        ['lgpd_apagar_lead', () => tx`select public.lgpd_apagar_lead(${ids.lead})`],
        ['lgpd_exportar_lead', () => tx`select public.lgpd_exportar_lead(${ids.lead})`],
        [
          'marcar_avisos_lidos',
          () => tx`select public.marcar_avisos_lidos(${[ids.aviso]}::uuid[])`,
        ],
        [
          'marcar_orcamento_enviado',
          () => tx`select public.marcar_orcamento_enviado(${ids.orcamento}, 'whatsapp')`,
        ],
        ['marcar_perdido', () => tx`select public.marcar_perdido(${ids.lead}, 'outro', null)`],
        [
          'pre_reservar_orcamento',
          () => tx`select public.pre_reservar_orcamento(${ids.orcamento})`,
        ],
        ['reabrir_lead', () => tx`select public.reabrir_lead(${ids.lead})`],
        [
          'registrar_contato',
          () => tx`select public.registrar_contato(${ids.lead}, 'whatsapp', 'x')`,
        ],
        [
          'registrar_mensagem',
          () => tx`select public.registrar_mensagem(${ids.lead}, 'enviada', null)`,
        ],
        ['remover_bloqueio', () => tx`select public.remover_bloqueio(${ids.bloqueio})`],
        [
          'margem_preparar_festa',
          () => tx`select public.margem_preparar_festa(${ids.reserva}, ${ids.pacote}, true)`,
        ],
        ['margem_fechar_festa', () => tx`select public.margem_fechar_festa(${ids.reserva})`],
        ['margem_reabrir_festa', () => tx`select public.margem_reabrir_festa(${ids.reserva}, 'x')`],
        [
          'margem_salvar_custos_festa',
          () => tx`select public.margem_salvar_custos_festa(${ids.reserva}, '{}'::jsonb)`,
        ],
        [
          'margem_salvar_custos_pacote',
          () => tx`select public.margem_salvar_custos_pacote(${ids.pacote}, '{}'::jsonb)`,
        ],
        [
          'registrar_recebimento',
          () =>
            tx`select public.registrar_recebimento(${ids.reserva}, 100, current_date, 'pix', null)`,
        ],
        [
          'estornar_recebimento',
          () => tx`select public.estornar_recebimento(${ids.recebimento}, 'x')`,
        ],
        [
          'salvar_plano_pagamento',
          () => tx`select public.salvar_plano_pagamento(${ids.reserva}, '{"parcelas": []}'::jsonb)`,
        ],
        [
          'emitir_contrato',
          () =>
            tx`select public.emitir_contrato(${tx.json({ orcamento_id: ids.orcamento, reserva_id: ids.reserva })})`,
        ],
      ];

      const devolveu: string[] = [];
      await assumirUsuario(tx, IDS.donoB);
      for (const [nome, fn] of chamadas) {
        const r = await tentar(tx, fn);
        if (!r.erro && nome === 'disponibilidade') devolveu.push(nome);
        if (
          !r.erro &&
          ['lgpd_exportar_lead', 'contrato_comprovante', 'ler_cpf_contrato'].includes(nome)
        ) {
          const linha = (r.r as postgres.Row[])[0] ?? {};
          if (Object.values(linha).some((v) => v !== null)) devolveu.push(nome);
        }
      }
      // leituras que só podem responder pela própria empresa
      const [m] = await tx`select public.modulo_acesso(${a}, 'orkmargem', null) as ok`;
      expect(m!.ok).toBe(false);
      const [s] =
        await tx`select public.status_contrato_da_reserva(${ids.reserva}, ${ids.orcamento}) as s`;
      expect(s!.s).toBeNull();
      await tx`reset role`;

      expect(devolveu).toEqual([]);
      expect(await digitalDeA(tx)).toBe(antes);
    });
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { criarClienteAsaas } from '@/server/cobranca/asaas';
import { criarDb } from '@/server/db/client';
import { cancelarCobrancasDaConta } from '@/server/lgpd/cobrancas';
import { contratarModulo } from '@/server/modulos/fluxos';
import { criarAsaasFalso } from '../support/asaas-fake';
import { conectar, emTransacao, IDS, urlBancoTeste } from '../support/db';
import { criarEmpresaTemporaria, removerEmpresa } from '../support/empresa-temporaria';

/*
 * Item 6 da análise de 17/11/2026 (§99): a exclusão definitiva (lgpd_excluir_empresa, chamada pela
 * rota /api/lgpd/processar depois de Storage e Auth) não deixa NENHUMA linha da empresa em nenhuma
 * tabela com empresa_id (tabela nova entra sozinha no teste). Roda com o Buffet Demo inteiro (o
 * seed mais completo), numa transação desfeita. E o pedido de exclusão cancela também as
 * assinaturas das soluções no Asaas (API falsa: nada sai de verdade).
 */

const sql = conectar();
const { db, sql: sqlDrizzle } = criarDb(urlBancoTeste(), { max: 2 });
afterAll(async () => {
  await sql.end();
  await sqlDrizzle.end();
});

describe('exclusão definitiva da conta (item 6)', () => {
  it('apaga a empresa de todas as tabelas com empresa_id e registra no /interno', async () => {
    await emTransacao(sql, async (tx) => {
      const tabelas = await tx<{ t: string }[]>`
        select c.table_schema || '.' || c.table_name as t
        from information_schema.columns c
        join information_schema.tables x on x.table_schema = c.table_schema
          and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
        where c.table_schema in ('public', 'publico') and c.column_name = 'empresa_id'
          and c.table_name <> 'auditoria_interna'
        order by 1`;
      const contar = async () => {
        const n: Record<string, number> = {};
        for (const { t } of tabelas) {
          const [r] = await tx.unsafe(`select count(*)::int as n from ${t} where empresa_id = $1`, [
            IDS.empresaA,
          ]);
          if (r!.n > 0) n[t] = r!.n;
        }
        return n;
      };
      const antes = await contar();
      // o Demo tem dados espalhados em muitas tabelas (o teste não é trivial)
      expect(Object.keys(antes).length).toBeGreaterThan(25);

      await tx`update public.empresas set exclusao_solicitada_em = now() - interval '31 days',
        exclusao_agendada_para = now() - interval '1 day' where id = ${IDS.empresaA}`;
      const [r] = await tx`select public.lgpd_excluir_empresa(${IDS.empresaA}::uuid) as ok`;
      expect(r!.ok).toBe(true);

      expect(await contar()).toEqual({});
      const [u] = await tx`select count(*)::int as n from public.usuarios
        where id in ${tx([IDS.donoA, IDS.vendedorA])}`;
      expect(u!.n).toBe(0);
      // o registro da exclusão fica só com o id (sem dado pessoal)
      const [aud] = await tx`select dados from public.auditoria_interna
        where acao = 'empresa.excluida' and dados ->> 'empresa_id' = ${IDS.empresaA}`;
      expect(Object.keys(aud!.dados as object).sort()).toEqual(['empresa_id', 'solicitada_em']);
      // a outra empresa continua inteira
      const [b] =
        await tx`select count(*)::int as n from public.empresas where id = ${IDS.empresaB}`;
      expect(b!.n).toBe(1);
    });
  });

  it('o pedido de exclusão cancela no Asaas o plano e as soluções contratadas', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    await sql`update public.modulos set venda_liberada = true where codigo = 'orkmargem'`;
    try {
      const falso = criarAsaasFalso({ apiKey: 'chave', urlPublica: 'http://asaas.falso' });
      const asaas = criarClienteAsaas(
        {
          apiKey: 'chave',
          ambiente: 'sandbox',
          webhookToken: 't',
          urlBase: 'http://asaas.falso/v3',
        },
        { fetch: falso.fetch },
      );
      const deps = { db, asaas };
      const dados = { nome: 'Dona Teste', documento: '529.982.247-25', email: 'dona@teste.com' };
      const r = await contratarModulo(deps, {
        empresaId: e.empresaId,
        usuarioId: e.donoId,
        codigo: 'orkmargem',
        dados,
      });
      expect(r.ok).toBe(true);

      expect(
        await cancelarCobrancasDaConta(deps, { empresaId: e.empresaId, usuarioId: e.donoId }),
      ).toEqual({
        ok: true,
      });
      expect([...falso.assinaturas.values()].every((a) => a.deleted)).toBe(true);
      const vivas = await sql`select count(*)::int as n from public.modulo_assinaturas
        where empresa_id = ${e.empresaId} and status <> 'cancelada'`;
      expect(vivas[0]!.n).toBe(0);
    } finally {
      await sql`update public.modulos set venda_liberada = false where codigo = 'orkmargem'`;
      await removerEmpresa(sql, e);
    }
  });
});

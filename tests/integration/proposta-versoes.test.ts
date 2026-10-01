import { afterAll, describe, expect, it } from 'vitest';
import { assumirUsuario, conectar, emTransacao, esperarErroSql, IDS } from '../support/db';
import { criarEmpresaTemporaria, removerEmpresa } from '../support/empresa-temporaria';
import { cenarioPublico, comoAnon, concluir, dataDaqui, iniciar } from '../support/publico';

const sql = conectar();
afterAll(() => sql.end());

describe('versões do orçamento (banco)', () => {
  it('só uma versão vigente por número; versões repetidas são recusadas', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const token = await comoAnon(tx, async () => {
        const t = await iniciar(tx, c, { data });
        return concluir(tx, c, t, { data });
      });
      const [o] = await tx`select * from public.orcamentos where token = ${token}`;
      const copia = (versao: number, status: string, token2: string) =>
        tx.savepoint(
          (
            s,
          ) => s`insert into public.orcamentos (empresa_id, lead_id, numero, versao, token, status, resultado)
            values (${IDS.empresaA}, ${o!.lead_id}, ${o!.numero}, ${versao}, ${token2},
                    ${status}::public.status_orcamento, ${tx.json({ versaoMotor: 1 })})`,
        );
      // segunda vigente do mesmo número: recusada pelo índice parcial
      await esperarErroSql(copia(2, 'enviado', 'x'.repeat(40)), '23505');
      // mesma versão de novo: recusada pelo unique (empresa, numero, versao)
      await esperarErroSql(copia(1, 'substituido', 'y'.repeat(40)), '23505');
      // versão 2 vigente com a 1 substituída: aceita
      await tx`update public.orcamentos set status = 'substituido' where id = ${o!.id}`;
      await copia(2, 'enviado', 'z'.repeat(40));
      const linhas = await tx`select versao, status from public.orcamentos
        where empresa_id = ${IDS.empresaA} and numero = ${o!.numero} order by versao`;
      expect(linhas).toEqual([
        { versao: 1, status: 'substituido' },
        { versao: 2, status: 'enviado' },
      ]);
    });
  });

  it('colunas internas e de rastreio existem com os padrões', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const token = await comoAnon(tx, () => iniciar(tx, c, { data }));
      const [o] = await tx`select aberturas, fora_antecedencia, observacoes_internas, conteudo
        from public.orcamentos where token = ${token}`;
      expect(o).toEqual({
        aberturas: 0,
        fora_antecedencia: false,
        observacoes_internas: null,
        conteudo: null,
      });
    });
  });
});

describe('exclusão vira desativação no catálogo', () => {
  it('item usado em orçamento não pode ser excluído; item não usado pode', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const [livre] =
        await tx`insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana)
        values (${IDS.empresaA}, 'Turno livre', '09:00', 120, '{0,1,2,3,4,5,6}') returning id`;
      const data = await dataDaqui(tx, 200);
      await comoAnon(tx, () => iniciar(tx, c, { data }));
      await assumirUsuario(tx, IDS.donoA);
      for (const [tabela, id] of [
        ['turnos', c.turno],
        ['espacos', c.espaco],
        ['tipos_evento', c.tipo],
      ] as const) {
        try {
          await tx.savepoint((s) => s`delete from ${s('public.' + tabela)} where id = ${id}`);
          throw new Error(`${tabela} usado foi excluído`);
        } catch (e) {
          expect((e as Error).message).toBe('CATALOGO_ITEM_EM_USO');
        }
      }
      const d = await tx`delete from public.turnos where id = ${livre!.id}`;
      expect(d.count).toBe(1);
      // desativar continua permitido
      const u = await tx`update public.turnos set ativo = false where id = ${c.turno}`;
      expect(u.count).toBe(1);
      const emUso = await tx`select tabela, id from public.catalogo_em_uso() where id = ${c.turno}`;
      expect(emUso).toEqual([{ tabela: 'turnos', id: c.turno }]);
    });
  });

  it('pacote e opcional usados ficam protegidos pelo pacote_id e pela referência do item', async () => {
    await emTransacao(sql, async (tx) => {
      const [pac] =
        await tx`insert into public.pacotes (empresa_id, nome, modelo_preco, preco_pessoa_centavos)
        values (${IDS.empresaA}, 'Pacote usado', 'por_pessoa', 10000) returning id`;
      const [opc] =
        await tx`insert into public.opcionais (empresa_id, nome, cobranca, preco_centavos)
        values (${IDS.empresaA}, 'Opcional usado', 'fixo', 5000) returning id`;
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const token = await comoAnon(tx, () => iniciar(tx, c, { data }));
      const [o] =
        await tx`update public.orcamentos set pacote_id = ${pac!.id} where token = ${token} returning id`;
      await tx`insert into public.orcamento_itens (empresa_id, orcamento_id, ordem, tipo, descricao,
          quantidade, valor_unitario_centavos, subtotal_centavos, referencia_id)
        values (${IDS.empresaA}, ${o!.id}, 0, 'opcional', 'Opcional usado', 1, 5000, 5000, ${opc!.id})`;
      await assumirUsuario(tx, IDS.donoA);
      for (const [tabela, id] of [
        ['pacotes', pac!.id],
        ['opcionais', opc!.id],
      ] as const) {
        await expect(
          tx.savepoint((s) => s`delete from ${s('public.' + tabela)} where id = ${id}`),
        ).rejects.toThrow('CATALOGO_ITEM_EM_USO');
      }
    });
  });

  it('apagar a empresa inteira continua funcionando (cascata)', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    const c = await cenarioPublico(sql, e.empresaId);
    const data = await dataDaqui(sql, 200);
    await sql.begin(async (tx) => {
      await comoAnon(tx, () => iniciar(tx, c, { data, whatsapp: '+5534990077001' }));
    });
    await removerEmpresa(sql, e);
    const [n] =
      await sql`select count(*)::int as n from public.turnos where empresa_id = ${e.empresaId}`;
    expect(n!.n).toBe(0);
  });
});

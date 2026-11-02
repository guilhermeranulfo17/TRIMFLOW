import { afterAll, describe, expect, it } from 'vitest';
import { assumirUsuario, comoUsuario, conectar, esperarErroSql } from '../support/db';
import {
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';
import { criarReservaConfirmada } from '../support/reserva';

/*
 * OrkMargem no banco: escrita só com o módulo vigente (e só o dono), cópia da previsão do
 * pacote para os convidados, custos realizados, fechamento travado, reabertura com motivo,
 * leitura do histórico depois de encerrar e isolamento entre empresas.
 */

const sql = conectar();
afterAll(() => sql.end());

async function comEmpresa(fn: (e: EmpresaTemporaria, pacote: string) => Promise<void>) {
  const e = await criarEmpresaTemporaria(sql, 'infantil');
  try {
    const [p] =
      await sql`insert into public.pacotes (empresa_id, nome, modelo_preco, preco_pessoa_centavos)
      values (${e.empresaId}, 'Super', 'por_pessoa', 9000) returning id`;
    await fn(e, p!.id as string);
  } finally {
    await removerEmpresa(sql, e);
  }
}

/** Direito ativo pago até daqui a 10 dias (como depois de um webhook de pagamento). */
async function ativar(empresa: string, pagoAteDias = 10) {
  await sql`insert into public.modulo_assinaturas (empresa_id, modulo, valor_centavos, status, pago_ate)
    values (${empresa}, 'orkmargem', 14900, 'ativa', current_date + ${pagoAteDias}::int)`;
}

const custosPacote = [
  { categoria: 'alimentacao', fixo_centavos: 0, por_convidado_centavos: 3500 },
  { categoria: 'equipe', fixo_centavos: 80000, por_convidado_centavos: 0 },
  { categoria: 'bebidas', fixo_centavos: 0, por_convidado_centavos: 0 },
];

describe('OrkMargem', () => {
  it('sem o módulo, nada é gravado (MODULO_INATIVO)', async () => {
    await comEmpresa(async (e, pacote) => {
      await comoUsuario(sql, e.donoId, async (tx) => {
        await esperarErroSql(
          tx.savepoint(
            (sp) =>
              sp`select public.margem_salvar_custos_pacote(${pacote}, ${sp.json(custosPacote)})`,
          ),
          '42501',
        );
      });
    });
  });

  it('copia a previsão, registra o realizado, fecha, reabre com motivo e guarda o histórico', async () => {
    await comEmpresa(async (e, pacote) => {
      await ativar(e.empresaId);
      const reserva = await criarReservaConfirmada(sql, e.empresaId, { dias: 15, convidados: 60 });
      const outra = await criarReservaConfirmada(sql, e.empresaId, { dias: 22, convidados: 40 });

      await comoUsuario(sql, e.donoId, async (tx) => {
        const [n] =
          await tx`select public.margem_salvar_custos_pacote(${pacote}, ${tx.json(custosPacote)}) as n`;
        expect(n!.n).toBe(2);
        const [c] = await tx`select public.margem_preparar_festa(${reserva}, ${pacote}) as n`;
        expect(c!.n).toBe(2);
        const itens = await tx`select categoria, previsto_centavos, realizado_centavos
          from public.margem_custos_festa where reserva_id = ${reserva} order by ordem`;
        expect(itens).toEqual([
          { categoria: 'alimentacao', previsto_centavos: 210000, realizado_centavos: null },
          { categoria: 'equipe', previsto_centavos: 80000, realizado_centavos: null },
        ]);
        // preparar de novo sem pedir: recusa
        await esperarErroSql(
          tx.savepoint((sp) => sp`select public.margem_preparar_festa(${reserva}, ${pacote})`),
          '23505',
        );

        // fechar com custo sem valor realizado: recusa
        await esperarErroSql(
          tx.savepoint((sp) => sp`select public.margem_fechar_festa(${reserva})`),
          '23514',
        );
        const realizados = [
          {
            categoria: 'alimentacao',
            descricao: 'Alimentação',
            previsto_centavos: 210000,
            realizado_centavos: 230000,
          },
          {
            categoria: 'equipe',
            descricao: 'Equipe',
            previsto_centavos: 80000,
            realizado_centavos: 80000,
          },
          {
            categoria: 'terceiros',
            descricao: 'Fotógrafo',
            previsto_centavos: 0,
            realizado_centavos: 45000,
          },
        ];
        await tx`select public.margem_salvar_custos_festa(${reserva}, ${tx.json(realizados)})`;
        await tx`select public.margem_fechar_festa(${reserva})`;
        // fechada: não muda
        await esperarErroSql(
          tx.savepoint(
            (sp) => sp`select public.margem_salvar_custos_festa(${reserva}, '[]'::jsonb)`,
          ),
          '23514',
        );
        await esperarErroSql(
          tx.savepoint((sp) => sp`select public.margem_reabrir_festa(${reserva}, '')`),
          '23514',
        );
        await tx`select public.margem_reabrir_festa(${reserva}, 'Nota do fotógrafo chegou depois')`;
        const [aud] = await tx`select dados from public.auditoria
          where empresa_id = ${e.empresaId} and acao = 'margem.reabrir'`;
        expect(aud!.dados).toMatchObject({ motivo: 'Nota do fotógrafo chegou depois' });

        // a outra festa não foi tocada
        expect(
          (
            await tx`select count(*)::int as n from public.margem_custos_festa where reserva_id = ${outra}`
          )[0]!.n,
        ).toBe(0);

        // vendedor (na mesma transação, para ver os dados acima) não lê nem grava custos
        await tx`reset role`;
        await assumirUsuario(tx, e.vendedorId);
        expect((await tx`select count(*)::int as n from public.margem_custos_festa`)[0]!.n).toBe(0);
        await esperarErroSql(
          tx.savepoint((sp) => sp`select public.margem_fechar_festa(${reserva})`),
          '42501',
        );

        // módulo encerrado: o histórico continua visível, mas nada novo é gravado
        await tx`reset role`;
        await tx`update public.modulo_assinaturas set status = 'cancelada', pago_ate = current_date - 1
          where empresa_id = ${e.empresaId}`;
        await assumirUsuario(tx, e.donoId);
        expect(
          (
            await tx`select count(*)::int as n from public.margem_custos_festa where reserva_id = ${reserva}`
          )[0]!.n,
        ).toBe(3);
        await esperarErroSql(
          tx.savepoint((sp) => sp`select public.margem_preparar_festa(${outra}, ${pacote})`),
          '42501',
        );
      });
    });
  });

  it('isolamento: outra empresa não lê nem prepara as festas desta', async () => {
    await comEmpresa(async (a) => {
      await ativar(a.empresaId);
      const reserva = await criarReservaConfirmada(sql, a.empresaId, { dias: 10 });
      await comoUsuario(sql, a.donoId, async (tx) => {
        await tx`select public.margem_preparar_festa(${reserva})`;
      });
      await comEmpresa(async (b) => {
        await ativar(b.empresaId);
        await comoUsuario(sql, b.donoId, async (tx) => {
          expect((await tx`select count(*)::int as n from public.margem_festas`)[0]!.n).toBe(0);
          await esperarErroSql(
            tx.savepoint((sp) => sp`select public.margem_preparar_festa(${reserva})`),
            'P0002',
          );
        });
      });
    });
  });

  it('conta suspensa: somente leitura também no OrkMargem', async () => {
    await comEmpresa(async (e, pacote) => {
      await ativar(e.empresaId);
      await sql`update public.empresas set plano = 'suspenso' where id = ${e.empresaId}`;
      await comoUsuario(sql, e.donoId, async (tx) => {
        await esperarErroSql(
          tx.savepoint(
            (sp) =>
              sp`select public.margem_salvar_custos_pacote(${pacote}, ${sp.json(custosPacote)})`,
          ),
          '42501',
        );
      });
    });
  });
});

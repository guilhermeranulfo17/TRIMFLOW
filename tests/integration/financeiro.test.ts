import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { assumirUsuario, conectar, emTransacao, IDS } from '../support/db';

/*
 * Etapa 11 no banco: plano de pagamento e recebimentos da festa. Só o dono; recebimento nunca
 * é apagado (estorno); o sinal pago na Agenda entra na primeira montagem do plano; isolamento
 * entre buffets e trava de conta suspensa.
 */

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;

async function como<T>(tx: Tx, usuarioId: string, fn: () => Promise<T>): Promise<T> {
  await assumirUsuario(tx, usuarioId);
  try {
    return await fn();
  } finally {
    await tx`reset role`.catch(() => {});
    await tx`select set_config('request.jwt.claims', '', true)`.catch(() => {});
  }
}

async function erro(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<string | undefined> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp as unknown as Tx);
    });
  } catch (e) {
    return (e as { message?: string }).message;
  }
  return undefined;
}

/** Reserva confirmada do Buffet Demo, sem plano nem recebimentos, com sinal pago na Agenda. */
async function reserva(tx: Tx): Promise<string> {
  const [r] = await tx`select id from public.reservas
    where empresa_id = ${IDS.empresaA} and tipo = 'confirmada' and status = 'ativa' limit 1`;
  await tx`update public.reservas set sinal_centavos = 150000, sinal_pago_em = '2026-09-10',
    valor_total_centavos = 500000 where id = ${r!.id}`;
  return r!.id as string;
}

const PLANO = [
  { descricao: 'Sinal', valor_centavos: 150000, vence_em: '2026-09-10' },
  { descricao: 'Parcela 1 de 2', valor_centavos: 175000, vence_em: '2026-10-10' },
  { descricao: 'Parcela 2 de 2', valor_centavos: 175000, vence_em: '2026-11-10' },
];

describe('plano e recebimentos', () => {
  it('dono monta o plano; o sinal da Agenda vira recebimento uma vez; total da reserva confere', async () => {
    await emTransacao(sql, async (tx) => {
      const r = await reserva(tx);
      const n = await como(tx, IDS.donoA, async () => {
        const [l] = await tx`select public.salvar_plano_pagamento(${r}, ${tx.json(PLANO)}) as n`;
        return l!.n;
      });
      expect(n).toBe(3);
      const rec =
        await tx`select valor_centavos, recebido_em::text as em, forma from public.recebimentos
        where reserva_id = ${r}`;
      expect(rec).toEqual([{ valor_centavos: 150000, em: '2026-09-10', forma: 'outro' }]);
      // montar de novo não duplica o sinal
      const outro = [{ descricao: 'Tudo', valor_centavos: 600000, vence_em: '2026-11-10' }];
      await como(
        tx,
        IDS.donoA,
        () => tx`select public.salvar_plano_pagamento(${r}, ${tx.json(outro)})`,
      );
      const [c] =
        await tx`select count(*)::int as n from public.recebimentos where reserva_id = ${r}`;
      expect(c!.n).toBe(1);
      const [t] = await tx`select valor_total_centavos as v from public.reservas where id = ${r}`;
      expect(t!.v).toBe(600000);
      const [a] = await tx`select count(*)::int as n from public.auditoria
        where entidade_id = ${r} and acao = 'financeiro.plano'`;
      expect(a!.n).toBe(2);
    });
  });

  it('registrar e estornar; recebimento nunca é apagado nem editado', async () => {
    await emTransacao(sql, async (tx) => {
      const r = await reserva(tx);
      const id = await como(tx, IDS.donoA, async () => {
        const [l] =
          await tx`select public.registrar_recebimento(${r}, 175000, current_date, 'pix', 'Parcela 1') as id`;
        return l!.id as string;
      });
      expect(
        await erro(tx, (sp) =>
          como(
            sp,
            IDS.donoA,
            () => sp`select public.registrar_recebimento(${r}, 100, current_date + 1, 'pix', null)`,
          ),
        ),
      ).toBe('FINANCEIRO_RECEBIMENTO_INVALIDO');
      expect(
        await erro(tx, (sp) =>
          como(
            sp,
            IDS.donoA,
            () => sp`select public.registrar_recebimento(${r}, 100, current_date, 'cheque', null)`,
          ),
        ),
      ).toBe('FINANCEIRO_RECEBIMENTO_INVALIDO');
      // ninguém edita nem apaga direto (nem pelo banco com sessão)
      expect(
        await erro(
          tx,
          (sp) => sp`update public.recebimentos set valor_centavos = 1 where id = ${id}`,
        ),
      ).toBe('RECEBIMENTO_IMUTAVEL');
      expect(
        await erro(tx, (sp) =>
          como(sp, IDS.donoA, () => sp`delete from public.recebimentos where id = ${id}`),
        ),
      ).toBeDefined();

      const ok = await como(tx, IDS.donoA, async () => {
        const [l] = await tx`select public.estornar_recebimento(${id}, 'Lançado em dobro') as ok`;
        return l!.ok;
      });
      expect(ok).toBe(true);
      const again = await como(tx, IDS.donoA, async () => {
        const [l] = await tx`select public.estornar_recebimento(${id}, null) as ok`;
        return l!.ok;
      });
      expect(again).toBe(false);
      const [e] =
        await tx`select estornado_em is not null as est, estorno_motivo from public.recebimentos where id = ${id}`;
      expect(e).toEqual({ est: true, estorno_motivo: 'Lançado em dobro' });
    });
  });

  it('pré-reserva não tem financeiro; vendedor não lê nem escreve; outro buffet não vê', async () => {
    await emTransacao(sql, async (tx) => {
      const r = await reserva(tx);
      await como(
        tx,
        IDS.donoA,
        () => tx`select public.registrar_recebimento(${r}, 1000, current_date, 'dinheiro', null)`,
      );
      const [pre] = await tx`select id from public.reservas where empresa_id = ${IDS.empresaA}
        and tipo = 'pre_reserva' limit 1`;
      if (pre) {
        expect(
          await erro(tx, (sp) =>
            como(
              sp,
              IDS.donoA,
              () =>
                sp`select public.registrar_recebimento(${pre.id}, 1000, current_date, 'pix', null)`,
            ),
          ),
        ).toBe('FINANCEIRO_RESERVA_NAO_CONFIRMADA');
      }
      expect(
        await erro(tx, (sp) =>
          como(
            sp,
            IDS.vendedorA,
            () => sp`select public.registrar_recebimento(${r}, 1000, current_date, 'pix', null)`,
          ),
        ),
      ).toBe('FINANCEIRO_SO_DONO');
      const lido = (u: string) =>
        como(
          tx,
          u,
          async () => (await tx`select id from public.recebimentos where reserva_id = ${r}`).length,
        );
      expect(await lido(IDS.donoA)).toBe(1);
      expect(await lido(IDS.vendedorA)).toBe(0);
      expect(await lido(IDS.donoB)).toBe(0);
      expect(
        await erro(tx, (sp) =>
          como(
            sp,
            IDS.donoB,
            () => sp`select public.registrar_recebimento(${r}, 1000, current_date, 'pix', null)`,
          ),
        ),
      ).toBe('FINANCEIRO_RESERVA_NAO_ENCONTRADA');
      // escrita direta: ninguém do navegador
      expect(
        await erro(tx, (sp) =>
          como(
            sp,
            IDS.donoA,
            () => sp`insert into public.reserva_parcelas (empresa_id, reserva_id, numero, descricao, valor_centavos, vence_em)
            values (${IDS.empresaA}, ${r}, 9, 'x', 1, current_date)`,
          ),
        ),
      ).toBeDefined();
    });
  });

  it('conta suspensa: não registra; plano inválido é recusado', async () => {
    await emTransacao(sql, async (tx) => {
      const r = await reserva(tx);
      expect(
        await erro(tx, (sp) =>
          como(
            sp,
            IDS.donoA,
            () =>
              sp`select public.salvar_plano_pagamento(${r}, ${sp.json([{ descricao: '', valor_centavos: 10, vence_em: '2026-10-10' }])})`,
          ),
        ),
      ).toBe('FINANCEIRO_PLANO_INVALIDO');
      expect(
        await erro(tx, (sp) =>
          como(sp, IDS.donoA, () => sp`select public.salvar_plano_pagamento(${r}, ${sp.json([])})`),
        ),
      ).toBe('FINANCEIRO_PLANO_INVALIDO');
      await tx`update public.empresas set plano = 'suspenso' where id = ${IDS.empresaA}`;
      expect(
        await erro(tx, (sp) =>
          como(
            sp,
            IDS.donoA,
            () => sp`select public.registrar_recebimento(${r}, 1000, current_date, 'pix', null)`,
          ),
        ),
      ).toBe('CONTA_SOMENTE_LEITURA');
    });
  });
});

import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { assumirUsuario, conectar, emTransacao, IDS } from '../support/db';
import {
  cenarioPublico,
  comoAnon,
  dataDaqui,
  preReservar,
  salvarInterno,
  type Cenario,
} from '../support/publico';

/*
 * Item 1 da análise de 17/11/2026 (§99): orçamento aceito cuja pré-reserva venceu ou foi
 * cancelada volta a ficar aberto (o cliente pede de novo pelo link e o dono pré-reserva de novo).
 * O diagnóstico do /interno lista os aceitos sem reserva viva.
 */

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;

async function comoDono<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  await assumirUsuario(tx, IDS.donoA);
  try {
    return await fn();
  } finally {
    await tx`reset role`;
  }
}

async function preReservado(tx: Tx, c: Cenario) {
  const data = await dataDaqui(tx, 200);
  const o = await comoDono(tx, () => salvarInterno(tx, c, { data }));
  await comoDono(tx, () => tx`select public.pre_reservar_orcamento(${o.id})`);
  const [r] = await tx`select id from public.reservas where orcamento_id = ${o.id}`;
  return { orcamento: o.id as string, token: o.token as string, reserva: r!.id as string };
}

const statusDe = async (tx: Tx, id: string) =>
  (await tx`select status from public.orcamentos where id = ${id}`)[0]!.status as string;

const diagnostico = (tx: Tx, incluirTeste = true) =>
  tx`select orcamento_id, situacao from public.interno_aceitos_sem_reserva(${incluirTeste})`;

describe('aceite sem reserva (item 1)', () => {
  it('pré-reserva vencida pelo job: o orçamento volta a ficar aberto e o dono pré-reserva de novo', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const p = await preReservado(tx, c);
      expect(await statusDe(tx, p.orcamento)).toBe('aceito');

      await tx`update public.reservas set expira_em = now() - interval '1 minute' where id = ${p.reserva}`;
      // antes do job: aparece no diagnóstico como vencida sem job
      const antes = await diagnostico(tx);
      expect(antes.find((d) => d.orcamento_id === p.orcamento)?.situacao).toBe(
        'pre_reserva_vencida_sem_job',
      );

      await tx`select public.vencer_pre_reservas()`;
      expect(['enviado', 'visualizado']).toContain(await statusDe(tx, p.orcamento));
      const aud = await tx`select acao from public.auditoria where entidade_id = ${p.orcamento}`;
      expect(aud.map((a) => a.acao)).toContain('orcamento.aceite_reaberto');
      expect((await diagnostico(tx)).some((d) => d.orcamento_id === p.orcamento)).toBe(false);

      // o dono consegue pré-reservar de novo (antes: ORCAMENTO_ESTADO_INVALIDO)
      await comoDono(tx, () => tx`select public.pre_reservar_orcamento(${p.orcamento})`);
      expect(await statusDe(tx, p.orcamento)).toBe('aceito');
    });
  });

  it('pré-reserva vencida: o cliente pede de novo pelo link (antes: PUBLICO_ORCAMENTO_FECHADO)', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const p = await preReservado(tx, c);
      await tx`update public.reservas set expira_em = now() - interval '1 minute' where id = ${p.reserva}`;
      await tx`select public.vencer_pre_reservas()`;
      const r = await comoAnon(tx, () => preReservar(tx, c, p.token));
      expect(r.ok).toBe(true);
      expect(await statusDe(tx, p.orcamento)).toBe('aceito');
    });
  });

  it('pré-reserva cancelada pelo dono reabre; reserva confirmada cancelada não', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const p = await preReservado(tx, c);
      await comoDono(tx, () => tx`select public.cancelar_reserva(${p.reserva}, 'cliente desistiu')`);
      expect(['enviado', 'visualizado']).toContain(await statusDe(tx, p.orcamento));

      const q = await preReservado(tx, await cenarioPublico(tx, IDS.empresaA));
      await comoDono(tx, () => tx`select public.confirmar_reserva(${q.reserva}, 0)`);
      await comoDono(tx, () => tx`select public.cancelar_reserva(${q.reserva}, 'cliente desistiu')`);
      expect(await statusDe(tx, q.orcamento)).toBe('aceito');
      const d = await diagnostico(tx);
      expect(d.find((x) => x.orcamento_id === q.orcamento)?.situacao).toBe('reserva_cancelada');
    });
  });

  it('diagnóstico: só para a conexão administrativa e sem contas de teste por padrão', async () => {
    await emTransacao(sql, async (tx) => {
      const [p] = await tx`select has_function_privilege('authenticated',
        'public.interno_aceitos_sem_reserva(boolean)', 'execute') as auth,
        has_function_privilege('anon', 'public.interno_aceitos_sem_reserva(boolean)', 'execute') as anon`;
      expect(p).toEqual({ auth: false, anon: false });

      const c = await cenarioPublico(tx, IDS.empresaA);
      const pr = await preReservado(tx, c);
      // simula o estado antigo (aceito parado, pré-reserva já vencida) sem passar pelo trigger
      await tx`alter table public.reservas disable trigger reservas_reabrir_aceite`;
      await tx`update public.reservas set status = 'vencida' where id = ${pr.reserva}`;
      await tx`alter table public.reservas enable trigger reservas_reabrir_aceite`;
      expect((await diagnostico(tx, false)).map((d) => d.situacao)).toContain('pre_reserva_vencida');
      await tx`update public.empresas set isenta = true where id = ${IDS.empresaA}`;
      expect((await diagnostico(tx, false)).some((d) => d.orcamento_id === pr.orcamento)).toBe(false);
      expect((await diagnostico(tx, true)).some((d) => d.orcamento_id === pr.orcamento)).toBe(true);
    });
  });
});

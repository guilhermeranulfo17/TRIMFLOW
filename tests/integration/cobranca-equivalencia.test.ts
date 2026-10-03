import { afterAll, describe, expect, it } from 'vitest';
import { proximoStatus, STATUS_COBRANCA } from '@/domain/cobranca/asaas-eventos';
import { codigoPlanoVigente } from '@/domain/cobranca/limites';
import { SITUACOES, situacaoConta, type StatusAssinatura } from '@/domain/cobranca/situacao';
import { somarDias } from '@/domain/dates';
import { conectar } from '../support/db';

/*
 * Equivalência domínio × SQL da cobrança (mudou uma, mude a outra):
 * situação da conta (_situacao_conta), plano vigente (_codigo_plano) e status monotônico da
 * cobrança (_cobranca_proximo_status).
 */

const sql = conectar();
afterAll(() => sql.end());

/** PRNG determinístico (mulberry32): os mesmos casos em toda execução. */
function prng(semente: number) {
  let a = semente;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('situação da conta', () => {
  it('_situacao_conta = situacaoConta (2.000 casos, viradas de dia em SP e UTC)', async () => {
    const r = prng(9);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
    const base = new Date('2026-11-10T00:00:00Z');
    const hojeRef = '2026-11-10';
    const casos = Array.from({ length: 2000 }, () => {
      // instantes espalhados em ±20 dias, com minutos (pega a virada do dia no fuso)
      const agora = new Date(base.getTime() + Math.floor((r() - 0.5) * 40 * 24 * 60) * 60_000);
      const temTeste = r() < 0.7;
      const trialAte = temTeste
        ? new Date(base.getTime() + Math.floor((r() - 0.5) * 30 * 24 * 60) * 60_000)
        : null;
      const temAss = r() < 0.75;
      const status = pick<StatusAssinatura>(['pendente', 'ativa', 'cancelada']);
      const pagoAte =
        temAss && status !== 'pendente' && r() < 0.85
          ? somarDias(hojeRef, Math.floor((r() - 0.5) * 30))
          : null;
      const atrasadaDesde =
        temAss && r() < 0.4 ? somarDias(hojeRef, Math.floor((r() - 0.5) * 30)) : null;
      return {
        agora,
        fuso: pick(['America/Sao_Paulo', 'UTC', 'America/Manaus']),
        trialAte,
        isenta: r() < 0.05,
        suspensaManual: r() < 0.05,
        assinatura: temAss ? { status, pagoAte, atrasadaDesde } : null,
      };
    });
    const linhas = await sql`
      select c.n, public._situacao_conta(c.agora, c.fuso, c.trial_ate, c.isenta, c.manual,
        c.status, c.pago_ate, c.atrasada) as s
      from jsonb_to_recordset(${sql.json(
        casos.map((c, n) => ({
          n,
          agora: c.agora.toISOString(),
          fuso: c.fuso,
          trial_ate: c.trialAte?.toISOString() ?? null,
          isenta: c.isenta,
          manual: c.suspensaManual,
          status: c.assinatura?.status ?? null,
          pago_ate: c.assinatura?.pagoAte ?? null,
          atrasada: c.assinatura?.atrasadaDesde ?? null,
        })),
      )}) as c(n int, agora timestamptz, fuso text, trial_ate timestamptz, isenta boolean,
               manual boolean, status text, pago_ate date, atrasada date)`;
    const vistos = new Set<string>();
    for (const l of linhas) {
      const c = casos[l.n as number]!;
      const esperado = situacaoConta(c);
      vistos.add(esperado);
      expect(l.s, JSON.stringify(c)).toBe(esperado);
    }
    expect(linhas).toHaveLength(2000);
    // a amostra cobre todas as situações
    expect([...vistos].sort()).toEqual([...SITUACOES].sort());
  });

  it('_codigo_plano = codigoPlanoVigente', async () => {
    for (const situacao of SITUACOES) {
      for (const isenta of [false, true]) {
        for (const plano of [null, 'essencial', 'profissional']) {
          const [l] = await sql`select public._codigo_plano(${situacao}::public.plano_empresa,
            ${isenta}, ${plano}) as c`;
          expect(l!.c, `${situacao} ${isenta} ${plano}`).toBe(
            codigoPlanoVigente({ situacao, isenta, planoAssinatura: plano }),
          );
        }
      }
    }
  });
});

describe('status da cobrança', () => {
  it('_cobranca_proximo_status = proximoStatus (tabela completa)', async () => {
    for (const atual of [null, ...STATUS_COBRANCA]) {
      for (const novo of STATUS_COBRANCA) {
        const [l] = await sql`select public._cobranca_proximo_status(${atual}, ${novo}) as s`;
        expect(l!.s, `${atual} → ${novo}`).toBe(proximoStatus(atual, novo));
      }
    }
  });
});

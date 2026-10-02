import { afterAll, describe, expect, it } from 'vitest';
import { CANAIS_EXTERNOS, canaisDoTipo, TIPOS_AVISO } from '@/domain/avisos/canais';
import { agendarAviso } from '@/domain/avisos/silencio';
import {
  avaliarRegra,
  proximoHorarioComercial,
  REGRAS_FOLLOW_UP,
  type FatosFollowUp,
} from '@/domain/follow-up/regras';
import { tituloTarefa } from '@/domain/follow-up/titulos';
import { conectar } from '../support/db';

/*
 * Equivalência domínio × SQL das regras da Etapa 7 (mudou uma, mude a outra):
 * silêncio (_aviso_agendar), canais (_aviso_canais), follow-up (_follow_up_avaliar),
 * títulos (_follow_up_titulo) e horário comercial (_proximo_horario_comercial).
 */

const sql = conectar();
afterAll(() => sql.end());

const SP = 'America/Sao_Paulo';
const T0 = new Date('2026-10-05T15:00:00Z'); // segunda, 12:00 em São Paulo
const h = (horas: number) => new Date(T0.getTime() + horas * 3_600_000);

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

describe('silêncio', () => {
  it('_aviso_agendar = agendarAviso (2 dias, de 17 em 17 min, 5 janelas)', async () => {
    const janelas = [
      ['22:00', '07:00'],
      ['13:00', '14:00'],
      ['00:00', '00:00'],
      ['23:30', '00:30'],
      ['07:00', '22:00'],
    ];
    const casos: [Date, string, string][] = [];
    for (let m = 0; m < 48 * 60; m += 17) {
      for (const [i, f] of janelas) casos.push([new Date(T0.getTime() + m * 60_000), i!, f!]);
    }
    const linhas =
      await sql`select c.n, public._aviso_agendar(c.agora, ${SP}, c.ini::time, c.fim::time) as q
      from jsonb_to_recordset(${sql.json(casos.map(([a, i, f], n) => ({ n, agora: a.toISOString(), ini: i, fim: f })))})
        as c(n int, agora timestamptz, ini text, fim text)`;
    for (const l of linhas) {
      const [agora, ini, fim] = casos[l.n as number]!;
      expect((l.q as Date).toISOString(), `${agora.toISOString()} ${ini}-${fim}`).toBe(
        agendarAviso(agora, ini, fim, SP).toISOString(),
      );
    }
    expect(linhas.length).toBeGreaterThan(800);
  });
});

describe('canais', () => {
  it('_aviso_canais = canaisDoTipo', async () => {
    const prefs: Record<string, unknown>[] = [
      {},
      Object.fromEntries(TIPOS_AVISO.map((t) => [t, []])),
      Object.fromEntries(TIPOS_AVISO.map((t) => [t, ['push']])),
      Object.fromEntries(TIPOS_AVISO.map((t) => [t, ['whatsapp']])),
      Object.fromEntries(TIPOS_AVISO.map((t) => [t, [...CANAIS_EXTERNOS]])),
      { pre_reserva_pedida: 'push' },
    ];
    for (const p of prefs) {
      for (const t of TIPOS_AVISO) {
        const [r] =
          await sql`select public._aviso_canais(${t}::public.tipo_aviso, ${sql.json(p as never)}) as c`;
        expect(r!.c, `${t} ${JSON.stringify(p)}`).toEqual(canaisDoTipo(t, p));
      }
    }
  });
});

describe('follow-up', () => {
  const opcoes = {
    status: ['novo', 'em_andamento', 'pre_reservado', 'frio', 'perdido', 'abandonou'] as const,
    temperatura: ['morno', 'quente', 'frio'] as const,
    quenteDesde: [null, h(-3), h(-1), h(-30)],
    propostaEnviadaEm: [null, h(-30), h(-10), h(-24)],
    orcamentoStatus: [null, 'enviado', 'visualizado', 'aceito', 'expirado'] as const,
    validadeAte: [null, '2026-10-06', '2026-10-04', '2026-10-07', '2026-10-05'],
    ultimaAcaoClienteEm: [null, h(-20), h(-2)],
    ultimaAcaoVendedorEm: [null, h(-40), h(-5), h(-2), h(-30)],
    preReserva: [null, [h(10), h(-38)], [h(30), h(-18)], [h(-1), h(-49)]] as const,
    visitaEm: [null, h(27), h(3), h(50)],
    visitaRealizadaEm: [null, h(-30), h(-5)],
    semRespostaFeitaEm: [null, h(-80), h(-24), h(-72)],
    tarefaCriadaEm: [null, h(-50), h(-1), h(-100)],
    agora: [0, 1, 5, -3, 21, 30],
  };
  const escolher = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;

  it('_follow_up_avaliar = avaliarRegra (2.400 casos sorteados, 8 regras)', async () => {
    const r = prng(20261007);
    const casos: { regra: string; f: FatosFollowUp; agora: Date; criada: Date | null }[] = [];
    for (let i = 0; i < 2400; i++) {
      const pre = escolher(r, opcoes.preReserva);
      casos.push({
        regra: REGRAS_FOLLOW_UP[i % REGRAS_FOLLOW_UP.length]!,
        agora: h(escolher(r, opcoes.agora)),
        criada: escolher(r, opcoes.tarefaCriadaEm),
        f: {
          status: escolher(r, opcoes.status),
          temperatura: escolher(r, opcoes.temperatura),
          quenteDesde: escolher(r, opcoes.quenteDesde),
          propostaEnviadaEm: escolher(r, opcoes.propostaEnviadaEm),
          orcamentoStatus: escolher(r, opcoes.orcamentoStatus),
          validadeAte: escolher(r, opcoes.validadeAte),
          ultimaAcaoClienteEm: escolher(r, opcoes.ultimaAcaoClienteEm),
          ultimaAcaoVendedorEm: escolher(r, opcoes.ultimaAcaoVendedorEm),
          preReservaExpiraEm: pre ? pre[0] : null,
          preReservaCriadaEm: pre ? pre[1] : null,
          visitaEm: escolher(r, opcoes.visitaEm),
          visitaRealizadaEm: escolher(r, opcoes.visitaRealizadaEm),
          semRespostaFeitaEm: escolher(r, opcoes.semRespostaFeitaEm),
        },
      });
    }
    const iso = (d: Date | null) => (d ? d.toISOString() : null);
    const entrada = casos.map((c, n) => ({
      n,
      regra: c.regra,
      agora: c.agora.toISOString(),
      criada: iso(c.criada),
      f: {
        status: c.f.status,
        temperatura: c.f.temperatura,
        quente_desde: iso(c.f.quenteDesde),
        proposta_enviada_em: iso(c.f.propostaEnviadaEm),
        orcamento_status: c.f.orcamentoStatus,
        validade_ate: c.f.validadeAte,
        ultima_acao_cliente_em: iso(c.f.ultimaAcaoClienteEm),
        ultima_acao_vendedor_em: iso(c.f.ultimaAcaoVendedorEm),
        pre_reserva_expira_em: iso(c.f.preReservaExpiraEm),
        pre_reserva_criada_em: iso(c.f.preReservaCriadaEm),
        visita_em: iso(c.f.visitaEm),
        visita_realizada_em: iso(c.f.visitaRealizadaEm),
        sem_resposta_feita_em: iso(c.f.semRespostaFeitaEm),
      },
    }));
    const linhas = await sql`select c.n,
        public._follow_up_avaliar(c.regra, c.f, c.agora, ${SP}, null, c.criada) as a
      from jsonb_to_recordset(${sql.json(entrada as never)})
        as c(n int, regra text, agora timestamptz, criada timestamptz, f jsonb)`;
    const contagem: Record<string, number> = {};
    for (const l of linhas) {
      const c = casos[l.n as number]!;
      const esperado = avaliarRegra(c.regra as never, c.f, {
        agora: c.agora,
        fuso: SP,
        tarefaCriadaEm: c.criada,
      });
      expect(l.a, JSON.stringify(entrada[l.n as number])).toBe(esperado);
      contagem[`${c.regra}:${esperado}`] = (contagem[`${c.regra}:${esperado}`] ?? 0) + 1;
    }
    // cada regra cai em "criar" pelo menos uma vez (a tabela cobre os três resultados)
    for (const regra of REGRAS_FOLLOW_UP)
      expect(contagem[`${regra}:criar`] ?? 0, regra).toBeGreaterThan(0);
  });

  it('_follow_up_titulo = tituloTarefa', async () => {
    for (const regra of REGRAS_FOLLOW_UP) {
      for (const visita of [null, new Date('2026-10-10T21:00:00Z')]) {
        const [r] =
          await sql`select public._follow_up_titulo(${regra}, ' Ana  Souza ', ${visita}, ${SP}) as t`;
        expect(r!.t).toBe(tituloTarefa(regra, ' Ana  Souza ', { visitaEm: visita, fuso: SP }));
      }
    }
  });

  it('_proximo_horario_comercial = proximoHorarioComercial (uma semana, de hora em hora)', async () => {
    for (let i = 0; i < 24 * 7; i += 1) {
      const d = new Date(T0.getTime() + i * 3_600_000 + 7 * 60_000);
      const [r] = await sql`select public._proximo_horario_comercial(${d}, ${SP}) as q`;
      expect((r!.q as Date).toISOString(), d.toISOString()).toBe(
        proximoHorarioComercial(d, SP).toISOString(),
      );
    }
  });
});

import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { somarDias } from '@/domain/dates';
import {
  atendimento,
  calcularOcupacao,
  calcularResumo,
  datasLivres,
  filtrarPorVendedor,
  motivosDePerda,
  periodoAnterior,
  porOrigem,
  type ConfigOcupacao,
  type FatosNumeros,
  type FunilFato,
  type LeadFato,
  type ReservaFato,
} from '@/domain/numeros';
import type { StatusLead, TemperaturaLead } from '@/domain/publico/status-lead';
import type { OrigemLead } from '@/domain/publico/tipos';
import { conectar, emTransacao } from '../support/db';
import { criarEmpresaTemporaria, removerEmpresa } from '../support/empresa-temporaria';

/*
 * Equivalência SQL × domínio das métricas de Números (mudou uma, mude a outra).
 * Um gerador com semente fixa grava leads, orçamentos, atividades, avisos, reservas e eventos
 * do funil direto nas tabelas (triggers desligados: session_replication_role = replica) e, ao
 * mesmo tempo, monta os fatos esperados em TypeScript. As funções SQL (public._numeros_calcular
 * e _numeros_ocupacao) têm de devolver exatamente o que o domínio calcula com esses fatos.
 */

const sql = conectar();
afterAll(() => sql.end());

const SP = 'America/Sao_Paulo';

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

const ORIGENS: OrigemLead[] = [
  'instagram',
  'google',
  'whatsapp',
  'indicacao',
  'link_direto',
  'interno',
  'qrcode',
  'outro',
];
const STATUS: StatusLead[] = [
  'novo',
  'em_andamento',
  'abandonou',
  'pre_reservado',
  'reservado',
  'frio',
  'perdido',
  'cancelado',
  'realizado',
];
const TEMPERATURAS: TemperaturaLead[] = ['frio', 'morno', 'quente'];
const STATUS_ORC = [
  'em_montagem',
  'enviado',
  'visualizado',
  'substituido',
  'aceito',
  'expirado',
] as const;
const MOTIVOS = ['preco', 'data_indisponivel', 'concorrente', 'desistiu', 'sem_resposta', 'fora_da_area'];

const camel = (o: unknown): unknown =>
  Array.isArray(o)
    ? o.map(camel)
    : o && typeof o === 'object'
      ? Object.fromEntries(
          Object.entries(o).map(([k, v]) => [
            k.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()),
            camel(v),
          ]),
        )
      : o;

type Gerado = { fatos: FatosNumeros };

/** Gera o cenário no banco (dentro da transação) e devolve os fatos esperados. */
async function gerar(
  tx: postgres.TransactionSql,
  e: { empresaId: string; donoId: string; vendedorId: string },
  semente: number,
  base: Date,
): Promise<Gerado> {
  const r = prng(semente);
  const escolher = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const em = (horas: number) => new Date(base.getTime() + Math.round(horas * 60) * 60_000);
  // instantes perto da virada de dia (00:00–03:00 UTC = noite anterior em SP)
  const instante = () =>
    em((Math.floor(r() * 50) - 38) * 24 + Math.floor(r() * 30) * (r() < 0.3 ? 0.1 : 1));

  const [espaco] =
    await tx`insert into public.espacos (empresa_id, nome, capacidade_max) values (${e.empresaId}, 'Salão', 100) returning id`;
  const [turno] =
    await tx`insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana)
    values (${e.empresaId}, 'Tarde', '14:00', 240, '{0,1,2,3,4,5,6}') returning id`;

  const leads: LeadFato[] = [];
  const reservas: ReservaFato[] = [];
  const linhasLead: Record<string, unknown>[] = [];
  const linhasOrc: Record<string, unknown>[] = [];
  const linhasAtiv: Record<string, unknown>[] = [];
  const linhasAviso: Record<string, unknown>[] = [];
  const linhasRes: Record<string, unknown>[] = [];
  let numero = 0;

  for (let i = 0; i < 160; i++) {
    const id = randomUUID();
    const criadoEm = instante();
    const teste = r() < 0.1;
    const status = escolher(STATUS);
    const responsavelId = escolher([null, e.donoId, e.vendedorId, e.vendedorId]);
    const perdidoEm =
      status === 'perdido'
        ? em((criadoEm.getTime() - base.getTime()) / 3_600_000 + r() * 200)
        : null;
    const motivo = status === 'perdido' ? escolher(MOTIVOS) : null;
    const lead = {
      id,
      empresa_id: e.empresaId,
      nome: `Lead ${i}`,
      whatsapp_e164: `+5534990${String(semente % 1000).padStart(3, '0')}${String(i).padStart(4, '0')}`,
      origem: escolher(ORIGENS),
      status,
      temperatura: escolher(TEMPERATURAS),
      ultimo_passo: escolher([null, 1, 3, 5, 6]),
      eh_teste: teste,
      responsavel_id: responsavelId,
      perdido_em: perdidoEm,
      motivo_perda_codigo: motivo,
      criado_em: criadoEm,
    };
    linhasLead.push(lead);

    // orçamentos (vigente = mais recente não substituído)
    const orcs = Array.from({ length: Math.floor(r() * 3) }, (_, k) => {
      numero += 1;
      const st = escolher(STATUS_ORC);
      const o = {
        id: randomUUID(),
        empresa_id: e.empresaId,
        lead_id: id,
        numero,
        token: `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`,
        status: st,
        resultado: st === 'em_montagem' ? null : tx.json({}),
        total_centavos: r() < 0.15 ? null : Math.floor(r() * 2_000_000),
        criado_em: em((criadoEm.getTime() - base.getTime()) / 3_600_000 + k + 0.5),
      };
      linhasOrc.push(o);
      return o;
    });
    const vigente = [...orcs]
      .filter((o) => o.status !== 'substituido')
      .sort((a, b) => b.criado_em.getTime() - a.criado_em.getTime())[0];

    // atividades
    const ativs: { tipo: string; autor: string; usuario: string | null; t: Date }[] = [];
    const nAtiv = Math.floor(r() * 5);
    for (let k = 0; k < nAtiv; k++) {
      const tipo = escolher([
        'pre_reserva_pedida',
        'visita_pedida',
        'contato_registrado',
        'nota',
        'responsavel_alterado',
        'lead_criado',
      ]);
      const autor =
        tipo === 'pre_reserva_pedida' || tipo === 'visita_pedida'
          ? escolher(['cliente', 'cliente', 'usuario'])
          : tipo === 'lead_criado'
            ? 'cliente'
            : 'usuario';
      const usuario = autor === 'usuario' ? escolher([e.donoId, e.vendedorId, null]) : null;
      const t = em((criadoEm.getTime() - base.getTime()) / 3_600_000 + r() * 72);
      ativs.push({ tipo, autor, usuario, t });
      linhasAtiv.push({
        empresa_id: e.empresaId,
        lead_id: id,
        tipo,
        autor,
        usuario_id: usuario,
        criado_em: t,
        dados: tx.json({}),
      });
    }
    const pedidos = ativs.filter(
      (a) => a.tipo === 'pre_reserva_pedida' || a.tipo === 'visita_pedida',
    );
    const acao =
      pedidos
        .filter((a) => a.autor === 'cliente')
        .map((a) => a.t)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const acaoVendedorApos = (t: Date | null) =>
      t === null
        ? null
        : (ativs
            .filter(
              (a) =>
                a.autor === 'usuario' &&
                a.usuario !== null &&
                a.tipo !== 'responsavel_alterado' &&
                a.t >= t,
            )
            .map((a) => a.t)
            .sort((a, b) => a.getTime() - b.getTime())[0] ?? null);

    // avisos
    const avisos = Array.from({ length: Math.floor(r() * 3) }, (_, k) => {
      const tipo = escolher(['pre_reserva_pedida', 'visita_pedida', 'cliente_parou']);
      const agendado = em((criadoEm.getTime() - base.getTime()) / 3_600_000 + r() * 48);
      linhasAviso.push({
        empresa_id: e.empresaId,
        usuario_id: e.donoId,
        tipo,
        lead_id: id,
        chave: `num:${semente}:${i}:${k}`,
        criado_em: agendado,
        agendado_para: agendado,
        dados: tx.json({}),
      });
      return { tipo, agendado };
    });
    const avisoEm =
      avisos
        .filter((a) => a.tipo !== 'cliente_parou')
        .map((a) => a.agendado)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    // reservas
    let confirmada = false;
    for (let k = 0; k < Math.floor(r() * 3); k++) {
      const tipo = escolher(['confirmada', 'pre_reserva']);
      const st = escolher(['ativa', 'realizada', 'cancelada', 'vencida']);
      const criado = em((criadoEm.getTime() - base.getTime()) / 3_600_000 + r() * 400);
      const conf =
        tipo === 'confirmada' && r() < 0.7
          ? em((criado.getTime() - base.getTime()) / 3_600_000 + r() * 100)
          : null;
      const valor = r() < 0.3 ? null : Math.floor(r() * 3_000_000);
      const data = somarDias('2026-12-01', Math.floor(r() * 60));
      linhasRes.push({
        empresa_id: e.empresaId,
        espaco_id: espaco!.id,
        turno_id: turno!.id,
        data,
        inicio: new Date(`${data}T17:00:00Z`),
        fim: new Date(`${data}T21:00:00Z`),
        tipo,
        status: st,
        expira_em: tipo === 'pre_reserva' ? new Date('2027-01-01T00:00:00Z') : null,
        cliente_nome: `Lead ${i}`,
        valor_total_centavos: valor,
        lead_id: id,
        criado_em: criado,
        confirmada_em: conf,
      });
      if (tipo === 'confirmada' && (st === 'ativa' || st === 'realizada')) {
        confirmada = true;
        if (!teste)
          reservas.push({
            leadId: id,
            confirmadaEm: conf ?? criado,
            valorCentavos: valor ?? vigente?.total_centavos ?? 0,
          });
      }
    }

    if (!teste) {
      leads.push({
        id,
        criadoEm,
        origem: lead.origem,
        responsavelId,
        status,
        temperatura: lead.temperatura,
        orcamentoCompleto:
          (lead.ultimo_passo ?? 0) >= 6 || orcs.some((o) => o.status !== 'em_montagem'),
        pediuPreOuVisita: pedidos.length > 0,
        temReservaConfirmada: confirmada,
        propostaStatus: vigente?.status ?? null,
        totalVigenteCentavos: vigente?.total_centavos ?? null,
        perdidoEm,
        motivoPerda: motivo,
        acaoClienteEm: acao,
        contatoAposAcaoEm: acaoVendedorApos(acao),
        avisoEm,
        contatoAposAvisoEm: acaoVendedorApos(avisoEm),
      });
    }
  }

  // funil
  const funil: FunilFato[] = [];
  const linhasFunil: Record<string, unknown>[] = [];
  for (let s = 0; s < 120; s++) {
    const sessao = randomUUID();
    const origem = escolher(ORIGENS.filter((o) => o !== 'interno'));
    const t0 = instante();
    for (let k = 0; k < 1 + Math.floor(r() * 4); k++) {
      const evento = escolher([
        'pagina_vista',
        'passo_visto',
        'passo_concluido',
        'abandono',
      ] as const);
      const passo = evento === 'pagina_vista' ? 0 : Math.floor(r() * 7);
      const criadoEm = new Date(t0.getTime() + k * 60_000);
      funil.push({ sessao, evento, passo, origem, criadoEm });
      linhasFunil.push({
        empresa_id: e.empresaId,
        sessao,
        evento,
        passo,
        origem,
        criado_em: criadoEm,
      });
    }
  }

  await tx`insert into public.leads ${tx(linhasLead)}`;
  if (linhasOrc.length) await tx`insert into public.orcamentos ${tx(linhasOrc)}`;
  if (linhasAtiv.length) await tx`insert into public.atividades ${tx(linhasAtiv)}`;
  if (linhasAviso.length) await tx`insert into public.avisos ${tx(linhasAviso)}`;
  if (linhasRes.length) await tx`insert into public.reservas ${tx(linhasRes)}`;
  await tx`insert into public.funil_eventos ${tx(linhasFunil)}`;
  return { fatos: { leads, reservas, funil } };
}

function esperado(f: FatosNumeros, de: string, ate: string) {
  const p = { de, ate };
  return {
    de,
    ate,
    resumo: calcularResumo(f, p, SP),
    anterior: calcularResumo(f, periodoAnterior(p), SP),
    porOrigem: porOrigem(f, p, SP),
    motivos: motivosDePerda(f, p, SP),
    atendimento: atendimento(f, p, SP),
  };
}

describe('Números: SQL = domínio', () => {
  it('métricas em vários períodos, para o dono e para o vendedor (3 sementes)', async () => {
    for (const semente of [8, 20261008, 777]) {
      const e = await criarEmpresaTemporaria(sql, 'infantil');
      try {
        await emTransacao(sql, async (tx) => {
          await tx`set local session_replication_role = replica`;
          const { fatos } = await gerar(tx, e, semente, new Date('2026-10-20T15:00:00Z'));
          const periodos: [string, string][] = [
            ['2026-10-01', '2026-10-31'],
            ['2026-10-26', '2026-11-01'],
            ['2026-10-15', '2026-10-15'],
            ['2026-09-01', '2026-11-30'],
          ];
          for (const [de, ate] of periodos) {
            for (const vendedor of [null, e.vendedorId]) {
              const [linha] =
                await tx`select public._numeros_calcular(${e.empresaId}, ${vendedor}, ${SP}, ${de}::date, ${ate}::date) as n`;
              const doSql = camel(linha!.n);
              const doDominio = esperado(filtrarPorVendedor(fatos, vendedor), de, ate);
              expect(doSql, `semente ${semente} ${de}..${ate} vendedor=${vendedor}`).toEqual(
                JSON.parse(JSON.stringify(doDominio)),
              );
            }
          }
          // o cenário cobre os casos: há reservas, perdas e atendimentos no mês
          const mes = esperado(fatos, '2026-10-01', '2026-10-31');
          expect(mes.resumo.leads).toBeGreaterThan(20);
          expect(mes.motivos.length).toBeGreaterThan(0);
          expect(mes.atendimento.total.acoes).toBeGreaterThan(0);
        });
      } finally {
        await removerEmpresa(sql, e);
      }
    }
  });

  it('ocupação e datas livres (2 sementes)', async () => {
    for (const semente of [3, 44]) {
      const e = await criarEmpresaTemporaria(sql, 'infantil');
      try {
        await emTransacao(sql, async (tx) => {
          await tx`set local session_replication_role = replica`;
          const r = prng(semente);
          const hoje = '2026-10-02';
          await tx`update public.regras_comerciais set antecedencia_min_dias = 3 where empresa_id = ${e.empresaId}`;
          const espacos = [];
          for (const [nome, cap, ativo] of [
            ['A', 1, true],
            ['B', 2, true],
            ['C', 1, false],
          ] as const) {
            const [x] =
              await tx`insert into public.espacos (empresa_id, nome, capacidade_max, eventos_simultaneos, ativo)
              values (${e.empresaId}, ${nome}, 100, ${cap}, ${ativo}) returning id`;
            espacos.push({ id: x!.id as string, capacidade: cap, ativo });
          }
          const turnos = [];
          for (const [nome, dias, ordem, ativo] of [
            ['Tarde', [0, 6], 2, true],
            ['Noite', [5, 6], 1, true],
            ['Almoço', [0, 1, 2], 3, true],
            ['Velho', [6], 4, false],
          ] as const) {
            const [x] =
              await tx`insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana, ordem, ativo)
              values (${e.empresaId}, ${nome}, '12:00', 180, ${dias as unknown as number[]}, ${ordem}, ${ativo}) returning id`;
            turnos.push({ id: x!.id as string, nome, diasSemana: [...dias], ordem, ativo });
          }
          const ativos = { e: espacos.filter((x) => x.ativo), t: turnos.filter((x) => x.ativo) };
          const cfg: ConfigOcupacao = {
            espacos: ativos.e.map(({ id, capacidade }) => ({ id, capacidade })),
            turnos: ativos.t.map(({ id, nome, diasSemana, ordem }) => ({
              id,
              nome,
              diasSemana,
              ordem,
            })),
            bloqueios: [],
            reservas: [],
          };
          for (let i = 0; i < 12; i++) {
            const data = somarDias(hoje, Math.floor(r() * 95));
            const turnoId = r() < 0.5 ? null : turnos[Math.floor(r() * 3)]!.id;
            const espacoId = r() < 0.5 ? null : espacos[Math.floor(r() * 2)]!.id;
            const ins =
              await tx`insert into public.bloqueios (empresa_id, data, turno_id, espaco_id)
              values (${e.empresaId}, ${data}, ${turnoId}, ${espacoId}) on conflict do nothing returning id`;
            if (ins.length) cfg.bloqueios.push({ data, turnoId, espacoId });
          }
          for (let i = 0; i < 90; i++) {
            const data = somarDias(hoje, Math.floor(r() * 95));
            const espaco = espacos[Math.floor(r() * 3)]!;
            const turno = turnos[Math.floor(r() * 4)]!;
            const tipo = r() < 0.6 ? 'confirmada' : 'pre_reserva';
            const status = r() < 0.8 ? 'ativa' : 'cancelada';
            const expira =
              tipo === 'pre_reserva'
                ? r() < 0.5
                  ? new Date(Date.now() + 86_400_000)
                  : new Date(Date.now() - 86_400_000)
                : null;
            await tx`insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, expira_em, cliente_nome)
              values (${e.empresaId}, ${espaco.id}, ${turno.id}, ${data}, ${`${data}T15:00:00Z`}, ${`${data}T18:00:00Z`},
                      ${tipo}, ${status}, ${expira}, 'Cliente')`;
            const ocupa =
              status === 'ativa' && (tipo === 'confirmada' || expira!.getTime() > Date.now());
            if (ocupa) cfg.reservas.push({ data, turnoId: turno.id, espacoId: espaco.id });
          }
          const [linha] =
            await tx`select public._numeros_ocupacao(${e.empresaId}, ${hoje}::date) as o`;
          const doSql = camel(linha!.o) as Record<string, unknown>;
          const { datasLivres: livresSql, ...ocupacaoSql } = doSql;
          expect(ocupacaoSql).toEqual(JSON.parse(JSON.stringify(calcularOcupacao(cfg, hoje, 3))));
          const livres = datasLivres(cfg, somarDias(hoje, 3), somarDias(hoje, 60));
          expect(livresSql).toEqual(livres.map((l) => ({ data: l.data, turnoIds: l.turnoIds })));
          expect(livres.length).toBeGreaterThan(0);
        });
      } finally {
        await removerEmpresa(sql, e);
      }
    }
  });
});

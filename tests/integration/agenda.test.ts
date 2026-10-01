import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assumirUsuario,
  comoUsuario,
  conectar,
  emTransacao,
  esperarErroSql,
  IDS,
} from '../support/db';
import { criarEmpresaTemporaria, removerEmpresa } from '../support/empresa-temporaria';

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;
type TurnoDef = { nome: string; hora: string; duracao: number; dias?: number[] };

/**
 * Cenário isolado dentro da transação (desfeita no fim): um espaço novo e turnos novos na
 * empresa A, longe das datas do seed. Roda como postgres; depois o teste assume o usuário.
 */
async function cenario(
  tx: Tx,
  opcoes: { capacidade?: number; intervalo?: number; turnos: TurnoDef[]; empresa?: string },
) {
  const empresa = opcoes.empresa ?? IDS.empresaA;
  if (opcoes.intervalo !== undefined) {
    await tx`update public.regras_comerciais set intervalo_entre_eventos_min = ${opcoes.intervalo}
      where empresa_id = ${empresa}`;
  }
  const [espaco] =
    await tx`insert into public.espacos (empresa_id, nome, capacidade_max, eventos_simultaneos)
    values (${empresa}, ${'Espaço ' + randomUUID().slice(0, 6)}, 100, ${opcoes.capacidade ?? 1})
    returning id`;
  const turnos: Record<string, string> = {};
  for (const t of opcoes.turnos) {
    const [linha] =
      await tx`insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana)
      values (${empresa}, ${t.nome}, ${t.hora}, ${t.duracao}, ${t.dias ?? [0, 1, 2, 3, 4, 5, 6]})
      returning id`;
    turnos[t.nome] = linha!.id as string;
  }
  return { espaco: espaco!.id as string, turnos };
}

/** Data civil futura, longe das datas do seed (que ficam no próximo mês). */
async function dataFutura(tx: Tx, dias = 200): Promise<string> {
  const [r] = await tx`select (current_date + ${dias}::int)::text as d`;
  return r!.d as string;
}

function reservar(
  tx: Tx,
  espaco: string,
  turno: string,
  data: string,
  tipo: 'pre_reserva' | 'confirmada' = 'confirmada',
) {
  return tx`select public.criar_reserva(${espaco}, ${turno}, ${data}::date, ${tipo}::public.tipo_reserva, 'Cliente Teste') as id`.then(
    (r) => r[0]!.id as string,
  );
}

/**
 * Espera um erro AGENDA_* dentro de um savepoint (um erro aborta a transação inteira, e os
 * testes seguem usando a mesma transação depois).
 */
async function esperarErroAgenda(tx: Tx, fn: (sp: Tx) => Promise<unknown>, codigo: string) {
  try {
    await tx.savepoint((sp) => fn(sp as Tx));
  } catch (e) {
    expect(String((e as Error).message)).toBe(codigo);
    return;
  }
  throw new Error(`Esperava ${codigo}, mas a operação passou.`);
}

/** esperarErroSql num savepoint. */
function esperarErroSqlSp(tx: Tx, fn: (sp: Tx) => Promise<unknown>, codigo: string) {
  return esperarErroSql(
    tx.savepoint((sp) => fn(sp as Tx)),
    codigo,
  );
}

const TARDE: TurnoDef = { nome: 'Tarde', hora: '15:00', duracao: 240 };
const NOITE: TurnoDef = { nome: 'Noite', hora: '20:00', duracao: 240 };

describe('criar_reserva: conflito por horário', () => {
  it('mesmo slot não aceita duas reservas (capacidade 1)', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { turnos: [TARDE] });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      await reservar(tx, c.espaco, c.turnos.Tarde!, data);
      await esperarErroAgenda(
        tx,
        (sp) => reservar(sp, c.espaco, c.turnos.Tarde!, data),
        'AGENDA_SLOT_OCUPADO',
      );
    });
  });

  it('turnos diferentes que se sobrepõem por horário conflitam', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, {
        intervalo: 0,
        turnos: [TARDE, { nome: 'Fim de tarde', hora: '18:00', duracao: 180 }],
      });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      await reservar(tx, c.espaco, c.turnos.Tarde!, data);
      await esperarErroAgenda(
        tx,
        (sp) => reservar(sp, c.espaco, c.turnos['Fim de tarde']!, data),
        'AGENDA_SLOT_OCUPADO',
      );
    });
  });

  it('intervalo entre eventos faz turnos colados conflitarem; com 0, não', async () => {
    const turnos = [TARDE, { nome: 'Colado', hora: '19:00', duracao: 120 }];
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { intervalo: 60, turnos });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      await reservar(tx, c.espaco, c.turnos.Tarde!, data);
      await esperarErroAgenda(
        tx,
        (sp) => reservar(sp, c.espaco, c.turnos.Colado!, data),
        'AGENDA_SLOT_OCUPADO',
      );
    });
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { intervalo: 0, turnos });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      await reservar(tx, c.espaco, c.turnos.Tarde!, data);
      await reservar(tx, c.espaco, c.turnos.Colado!, data);
    });
  });

  it('turno que passa da meia-noite conflita com o turno cedo do dia seguinte', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, {
        intervalo: 60,
        turnos: [
          { nome: 'Madrugada', hora: '22:00', duracao: 300 },
          { nome: 'Cedo', hora: '03:30', duracao: 120 },
        ],
      });
      const data = await dataFutura(tx);
      const [amanha] = await tx`select (${data}::date + 1)::text as d`;
      await assumirUsuario(tx, IDS.donoA);
      await reservar(tx, c.espaco, c.turnos.Madrugada!, data);
      await esperarErroAgenda(
        tx,
        (sp) => reservar(sp, c.espaco, c.turnos.Cedo!, amanha!.d as string),
        'AGENDA_SLOT_OCUPADO',
      );
    });
  });

  it('espaços diferentes não conflitam', async () => {
    await emTransacao(sql, async (tx) => {
      const a = await cenario(tx, { turnos: [TARDE] });
      const [outro] = await tx`insert into public.espacos (empresa_id, nome, capacidade_max)
        values (${IDS.empresaA}, 'Outro salão', 50) returning id`;
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      await reservar(tx, a.espaco, a.turnos.Tarde!, data);
      await reservar(tx, outro!.id as string, a.turnos.Tarde!, data);
    });
  });

  it('capacidade 2 aceita dois eventos e recusa o terceiro', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { capacidade: 2, turnos: [TARDE] });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      await reservar(tx, c.espaco, c.turnos.Tarde!, data);
      await reservar(tx, c.espaco, c.turnos.Tarde!, data, 'pre_reserva');
      await esperarErroAgenda(
        tx,
        (sp) => reservar(sp, c.espaco, c.turnos.Tarde!, data),
        'AGENDA_SLOT_OCUPADO',
      );
    });
  });

  it('recusa data passada e turno fora do dia da semana', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, {
        turnos: [TARDE, { nome: 'Só sábado', hora: '15:00', duracao: 240, dias: [6] }],
      });
      const [r] = await tx`select (current_date - 1)::text as ontem,
        (current_date + 200 + ((5 - extract(dow from current_date + 200)::int + 7) % 7))::text as sexta`;
      await assumirUsuario(tx, IDS.donoA);
      await esperarErroAgenda(
        tx,
        (sp) => reservar(sp, c.espaco, c.turnos.Tarde!, r!.ontem as string),
        'AGENDA_DATA_PASSADA',
      );
      await esperarErroAgenda(
        tx,
        (sp) => reservar(sp, c.espaco, c.turnos['Só sábado']!, r!.sexta as string),
        'AGENDA_TURNO_FORA_DO_DIA',
      );
    });
  });

  it('pré-reserva vencida (sem o job rodar) não impede nova reserva', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { turnos: [TARDE] });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      const id = await reservar(tx, c.espaco, c.turnos.Tarde!, data, 'pre_reserva');
      await tx`reset role`;
      await tx`update public.reservas set expira_em = now() - interval '1 minute' where id = ${id}`;
      await assumirUsuario(tx, IDS.donoA);
      await reservar(tx, c.espaco, c.turnos.Tarde!, data);
      const [antiga] = await tx`select status from public.reservas where id = ${id}`;
      expect(antiga!.status).toBe('ativa'); // o job ainda não rodou; mesmo assim o slot estava livre
    });
  });
});

describe('transições', () => {
  it('pré-reserva: estender, confirmar com sinal e cancelar', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { turnos: [TARDE] });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.vendedorA);
      const id = await reservar(tx, c.espaco, c.turnos.Tarde!, data, 'pre_reserva');
      const [antes] = await tx`select expira_em from public.reservas where id = ${id}`;
      await tx`select public.estender_pre_reserva(${id}, 24)`;
      const [depois] = await tx`select expira_em from public.reservas where id = ${id}`;
      expect(new Date(depois!.expira_em).getTime() - new Date(antes!.expira_em).getTime()).toBe(
        24 * 3600 * 1000,
      );
      await tx`select public.confirmar_reserva(${id}, 150000, current_date)`;
      const [conf] =
        await tx`select tipo, expira_em, sinal_centavos from public.reservas where id = ${id}`;
      expect(conf).toMatchObject({ tipo: 'confirmada', expira_em: null, sinal_centavos: 150000 });
      await esperarErroAgenda(
        tx,
        (sp) => sp`select public.estender_pre_reserva(${id}, 1)`,
        'AGENDA_ESTADO_INVALIDO',
      );
      await tx`select public.cancelar_reserva(${id}, 'Cliente desistiu')`;
      const [canc] =
        await tx`select status, motivo_cancelamento from public.reservas where id = ${id}`;
      expect(canc).toEqual({ status: 'cancelada', motivo_cancelamento: 'Cliente desistiu' });
      // Cancelada libera o slot na hora.
      await reservar(tx, c.espaco, c.turnos.Tarde!, data);
      const auditoria =
        await tx`select acao from public.auditoria where entidade_id = ${id} order by criado_em`;
      expect(auditoria.map((a) => a.acao)).toEqual([
        'reserva.pre_reservada',
        'reserva.prazo_estendido',
        'reserva.confirmada',
        'reserva.cancelada',
      ]);
    });
  });

  it('não confirma pré-reserva vencida', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { turnos: [TARDE] });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      const id = await reservar(tx, c.espaco, c.turnos.Tarde!, data, 'pre_reserva');
      await tx`reset role`;
      await tx`update public.reservas set expira_em = now() - interval '1 second' where id = ${id}`;
      await assumirUsuario(tx, IDS.donoA);
      await esperarErroAgenda(
        tx,
        (sp) => sp`select public.confirmar_reserva(${id})`,
        'AGENDA_PRE_RESERVA_VENCIDA',
      );
    });
  });
});

describe('bloqueios', () => {
  it('bloqueio de dia inteiro e de todos os espaços impede reserva', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { turnos: [TARDE, NOITE] });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      const [n] =
        await tx`select public.criar_bloqueio(${data}::date, ${data}::date, null, null, 'Reforma') as n`;
      expect(n!.n).toBe(1);
      await esperarErroAgenda(
        tx,
        (sp) => reservar(sp, c.espaco, c.turnos.Noite!, data),
        'AGENDA_BLOQUEADO',
      );
    });
  });

  it('bloqueio de um turno num espaço não afeta outro turno', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { turnos: [TARDE, NOITE] });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      await tx`select public.criar_bloqueio(${data}::date, ${data}::date, ${c.turnos.Tarde!}, ${c.espaco}, null)`;
      await esperarErroAgenda(
        tx,
        (sp) => reservar(sp, c.espaco, c.turnos.Tarde!, data),
        'AGENDA_BLOQUEADO',
      );
      await reservar(tx, c.espaco, c.turnos.Noite!, data);
    });
  });

  it('bloqueia um período de uma vez e recusa bloquear sobre reserva ativa', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { turnos: [TARDE] });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      const [n] =
        await tx`select public.criar_bloqueio(${data}::date, ${data}::date + 2, null, ${c.espaco}, 'Férias') as n`;
      expect(n!.n).toBe(3);
      const [depois] = await tx`select (${data}::date + 10)::text as d`;
      await reservar(tx, c.espaco, c.turnos.Tarde!, depois!.d as string);
      try {
        await tx`select public.criar_bloqueio(${depois!.d}::date, ${depois!.d}::date, null, null, null)`;
        throw new Error('deveria recusar');
      } catch (e) {
        expect((e as Error).message).toBe('AGENDA_BLOQUEIO_COM_RESERVA');
        expect((e as { detail?: string }).detail).toBe(depois!.d);
      }
    });
  });

  it('vendedor não bloqueia nem remove bloqueio', async () => {
    await emTransacao(sql, async (tx) => {
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      await assumirUsuario(tx, IDS.vendedorA);
      await esperarErroSqlSp(
        tx,
        (sp) =>
          sp`select public.criar_bloqueio(${data}::date + 1, ${data}::date + 1, null, null, null)`,
        '42501',
      );
    });
    await emTransacao(sql, async (tx) => {
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      await tx`select public.criar_bloqueio(${data}::date, ${data}::date, null, null, null)`;
      const [b] = await tx`select id from public.bloqueios where data = ${data}::date`;
      await assumirUsuario(tx, IDS.vendedorA);
      await esperarErroSqlSp(tx, (sp) => sp`select public.remover_bloqueio(${b!.id})`, '42501');
    });
  });
});

describe('disponibilidade', () => {
  it('estados por slot, sem nome de cliente, e vagas com capacidade', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { capacidade: 2, intervalo: 0, turnos: [TARDE, NOITE] });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      await reservar(tx, c.espaco, c.turnos.Tarde!, data);
      await reservar(tx, c.espaco, c.turnos.Tarde!, data, 'pre_reserva');
      await reservar(tx, c.espaco, c.turnos.Noite!, data);
      const linhas =
        await tx`select * from public.disponibilidade(${IDS.empresaA}, ${data}::date, ${data}::date, ${c.espaco})`;
      expect(Object.keys(linhas[0]!).sort()).toEqual(
        ['capacidade', 'data', 'espaco_id', 'estado', 'expira_em', 'turno_id', 'vagas'].sort(),
      );
      const porTurno = Object.fromEntries(linhas.map((l) => [l.turno_id, l]));
      expect(porTurno[c.turnos.Tarde!]).toMatchObject({ estado: 'lotado', vagas: 0 });
      expect(porTurno[c.turnos.Noite!]).toMatchObject({ estado: 'livre', vagas: 1 });
      expect(JSON.stringify(linhas)).not.toContain('Cliente Teste');
    });
  });

  it('respeita o limite de 400 dias e a empresa do usuário', async () => {
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      await tx`select count(*) from public.disponibilidade(${IDS.empresaA}, current_date, current_date + 399)`;
      await esperarErroAgenda(
        tx,
        (sp) =>
          sp`select count(*) from public.disponibilidade(${IDS.empresaA}, current_date, current_date + 400)`,
        'AGENDA_PERIODO_INVALIDO',
      );
      await esperarErroSqlSp(
        tx,
        (sp) =>
          sp`select count(*) from public.disponibilidade(${IDS.empresaB}, current_date, current_date + 1)`,
        '42501',
      );
    });
  });

  it('anon não executa as funções da agenda', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`select set_config('role', 'anon', true)`;
      await esperarErroSqlSp(
        tx,
        (sp) =>
          sp`select count(*) from public.disponibilidade(${IDS.empresaA}, current_date, current_date)`,
        '42501',
      );
    });
  });
});

describe('segurança das tabelas', () => {
  it('ninguém escreve direto em reservas e bloqueios', async () => {
    for (const usuario of [IDS.donoA, IDS.vendedorA]) {
      await comoUsuario(sql, usuario, async (tx) => {
        await esperarErroSqlSp(
          tx,
          (sp) =>
            sp`insert into public.bloqueios (empresa_id, data) values (${IDS.empresaA}, current_date + 300)`,
          '42501',
        );
        await esperarErroSqlSp(
          tx,
          (sp) => sp`update public.reservas set cliente_nome = 'x'`,
          '42501',
        );
        await esperarErroSqlSp(tx, (sp) => sp`delete from public.bloqueios`, '42501');
      });
    }
  });

  it('isolamento: empresa B não vê reservas nem bloqueios de A', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { turnos: [TARDE] });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      const id = await reservar(tx, c.espaco, c.turnos.Tarde!, data);
      await tx`select public.criar_bloqueio(${data}::date + 1, ${data}::date + 1, null, null, null)`;
      await assumirUsuario(tx, IDS.donoB);
      expect(await tx`select 1 from public.reservas where id = ${id}`).toHaveLength(0);
      expect(
        await tx`select 1 from public.bloqueios where empresa_id = ${IDS.empresaA}`,
      ).toHaveLength(0);
      await esperarErroAgenda(
        tx,
        (sp) => sp`select public.cancelar_reserva(${id})`,
        'AGENDA_NAO_ENCONTRADA',
      );
      // Espaço de outra empresa não serve para reservar.
      await esperarErroAgenda(
        tx,
        (sp) => reservar(sp, c.espaco, c.turnos.Tarde!, data),
        'AGENDA_REFERENCIA_INVALIDA',
      );
    });
  });
});

describe('jobs', () => {
  it('vencer_pre_reservas e marcar_realizadas alteram só o que devem', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenario(tx, { turnos: [TARDE, NOITE] });
      const data = await dataFutura(tx);
      await assumirUsuario(tx, IDS.donoA);
      const vencida = await reservar(tx, c.espaco, c.turnos.Tarde!, data, 'pre_reserva');
      const valida = await reservar(tx, c.espaco, c.turnos.Noite!, data, 'pre_reserva');
      const passada = await reservar(tx, c.espaco, c.turnos.Tarde!, await dataFutura(tx, 201));
      const futura = await reservar(tx, c.espaco, c.turnos.Noite!, await dataFutura(tx, 201));
      await tx`reset role`;
      await tx`update public.reservas set expira_em = now() - interval '1 minute' where id = ${vencida}`;
      await tx`update public.reservas set inicio = now() - interval '2 days', fim = now() - interval '1 day' where id = ${passada}`;
      await tx`select public.vencer_pre_reservas(), public.marcar_realizadas()`;
      const estados =
        await tx`select id, status from public.reservas where id in ${tx([vencida, valida, passada, futura])}`;
      expect(Object.fromEntries(estados.map((e) => [e.id, e.status]))).toEqual({
        [vencida]: 'vencida',
        [valida]: 'ativa',
        [passada]: 'realizada',
        [futura]: 'ativa',
      });
    });
  });

  it('usuários do painel não executam os jobs', async () => {
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      await esperarErroSqlSp(tx, (sp) => sp`select public.vencer_pre_reservas()`, '42501');
      await esperarErroSqlSp(tx, (sp) => sp`select public.marcar_realizadas()`, '42501');
    });
  });
});

describe('concorrência (duas conexões reais)', () => {
  it('duas transações disputando o último lugar: exatamente uma vence', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    const conexaoA = conectar();
    const conexaoB = conectar();
    try {
      const [espaco] = await sql`insert into public.espacos (empresa_id, nome, capacidade_max)
        values (${e.empresaId}, 'Salão', 100) returning id`;
      const [turno] =
        await sql`insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana)
        values (${e.empresaId}, 'Tarde', '15:00', 240, '{0,1,2,3,4,5,6}') returning id`;
      const [d] = await sql`select (current_date + 30)::text as d`;
      const tentar = (
        conexao: postgres.Sql,
        usuario: string,
        esperarAntesDoCommit?: Promise<void>,
      ) =>
        conexao.begin(async (tx) => {
          await assumirUsuario(tx, usuario);
          const id = await reservar(tx, espaco!.id as string, turno!.id as string, d!.d as string);
          if (esperarAntesDoCommit) await esperarAntesDoCommit;
          return id;
        });

      let liberarA!: () => void;
      const segurandoA = new Promise<void>((ok) => (liberarA = ok));
      const a = tentar(conexaoA, e.donoId, segurandoA);
      // A já pegou a trava e inseriu, mas ainda não fez commit.
      await new Promise((ok) => setTimeout(ok, 300));
      const b = tentar(conexaoB, e.vendedorId);
      await new Promise((ok) => setTimeout(ok, 300));
      liberarA();

      const resultados = await Promise.allSettled([a, b]);
      const venceram = resultados.filter((r) => r.status === 'fulfilled');
      const perderam = resultados.filter((r) => r.status === 'rejected');
      expect(venceram).toHaveLength(1);
      expect(perderam).toHaveLength(1);
      expect(String((perderam[0] as PromiseRejectedResult).reason.message)).toBe(
        'AGENDA_SLOT_OCUPADO',
      );
      const [total] =
        await sql`select count(*)::int as n from public.reservas where empresa_id = ${e.empresaId}`;
      expect(total!.n).toBe(1);
    } finally {
      await conexaoA.end();
      await conexaoB.end();
      await removerEmpresa(sql, e);
    }
  });
});

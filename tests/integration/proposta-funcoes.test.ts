import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { assumirUsuario, conectar, emTransacao, IDS } from '../support/db';
import { criarEmpresaTemporaria, removerEmpresa } from '../support/empresa-temporaria';
import {
  cenarioPublico,
  comoAnon,
  concluir,
  dataDaqui,
  iniciar,
  preReservar,
  salvarInterno,
  type Cenario,
} from '../support/publico';

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;

async function esperarMensagem(tx: Tx, fn: () => Promise<unknown>, mensagem: string) {
  try {
    await tx.savepoint(async () => {
      await fn();
    });
  } catch (e) {
    expect((e as Error).message).toBe(mensagem);
    return;
  }
  throw new Error(`Esperava ${mensagem}, mas passou.`);
}

async function comoDono<T>(tx: Tx, fn: () => Promise<T>, usuario: string = IDS.donoA): Promise<T> {
  await assumirUsuario(tx, usuario);
  try {
    return await fn();
  } finally {
    await tx`reset role`;
  }
}

async function versoes(tx: Tx | postgres.Sql, empresa: string, numero: number) {
  return tx`select versao, status, token, total_centavos from public.orcamentos
    where empresa_id = ${empresa} and numero = ${numero} order by versao`;
}

describe('versões', () => {
  it('cliente refaz: mesmo número, versão 2; token antigo resolve a vigente e a v1 não muda', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const t1 = await comoAnon(tx, async () => {
        const t = await iniciar(tx, c, { data });
        return concluir(tx, c, t, { data });
      });
      const t2 = await comoAnon(tx, () => concluir(tx, c, t1, { data, total: 650_000 }));
      const [o1] = await tx`select numero from public.orcamentos where token = ${t1}`;
      const vs = await versoes(tx, IDS.empresaA, o1!.numero);
      expect(vs.map((v) => [v.versao, v.status, v.total_centavos])).toEqual([
        [1, 'substituido', 500_000],
        [2, 'enviado', 650_000],
      ]);
      expect(vs[1]!.token).toBe(t2);
      const itensV1 = await tx`select subtotal_centavos from public.orcamento_itens i
        join public.orcamentos o on o.id = i.orcamento_id where o.token = ${t1}`;
      expect(itensV1.map((i) => i.subtotal_centavos)).toEqual([500_000]);

      const [p] = await comoAnon(tx, () => tx`select publico.proposta(${c.slug}, ${t1}) as p`);
      expect(p!.p).toMatchObject({
        versao: 2,
        token: t2,
        token_antigo: true,
        total_centavos: 650_000,
      });
      const atividades = await tx`select a.tipo from public.atividades a
        join public.orcamentos o on o.id = a.orcamento_id where o.token = ${t2}`;
      expect(atividades.map((a) => a.tipo)).toContain('versao_criada');
    });
  });

  it('pré-reservar com token de versão antiga pede para recarregar', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const t1 = await comoAnon(tx, async () => {
        const t = await iniciar(tx, c, { data });
        return concluir(tx, c, t, { data });
      });
      const t2 = await comoAnon(tx, () => concluir(tx, c, t1, { data }));
      const r = await comoAnon(tx, () => preReservar(tx, c, t1));
      expect(r).toMatchObject({ ok: false, codigo: 'PROPOSTA_ATUALIZADA', token: t2 });
    });
  });
});

describe('orçamento interno', () => {
  it('vendedor acima do limite é recusado; dono passa; mesmo WhatsApp reaproveita o lead', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      // vendedor do seed tem limite de 5%: 10% é recusado, 4% passa
      await comoDono(
        tx,
        () =>
          esperarMensagem(
            tx,
            () => salvarInterno(tx, c, { data, desconto: 50_000 }),
            'ORCAMENTO_DESCONTO_ACIMA_LIMITE',
          ),
        IDS.vendedorA,
      );
      const v = await comoDono(
        tx,
        () => salvarInterno(tx, c, { data, desconto: 20_000 }),
        IDS.vendedorA,
      );
      const d = await comoDono(tx, () =>
        salvarInterno(tx, c, { data, desconto: 200_000, nome: 'Outro Nome' }),
      );
      expect(d.lead_id).toBe(v.lead_id);
      expect(d.numero).toBe(v.numero + 1);
      const [o] =
        await tx`select canal, criado_por, status, versao from public.orcamentos where id = ${v.id}`;
      expect(o).toEqual({
        canal: 'interno',
        criado_por: IDS.vendedorA,
        status: 'enviado',
        versao: 1,
      });
      const [l] = await tx`select nome, status from public.leads where id = ${v.lead_id}`;
      expect(l).toEqual({ nome: 'Cliente Interno', status: 'em_andamento' });
    });
  });

  it('editar cria versão nova do mesmo número, com atividade e autor', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const v1 = await comoDono(tx, () => salvarInterno(tx, c, { data }));
      const v2 = await comoDono(
        tx,
        () => salvarInterno(tx, c, { data, orcamentoId: v1.id, convidados: 70, subtotal: 600_000 }),
        IDS.vendedorA,
      );
      expect([v2.numero, v2.versao]).toEqual([v1.numero, 2]);
      // editar uma versão antiga é recusado
      await comoDono(tx, () =>
        esperarMensagem(
          tx,
          () => salvarInterno(tx, c, { data, orcamentoId: v1.id }),
          'ORCAMENTO_VERSAO_ANTIGA',
        ),
      );
      const [a] = await tx`select usuario_id, autor from public.atividades
        where orcamento_id = ${v2.id} and tipo = 'versao_criada'`;
      expect(a).toEqual({ usuario_id: IDS.vendedorA, autor: 'usuario' });
    });
  });

  it('dados internos nunca aparecem na proposta pública', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const o = await comoDono(tx, () =>
        salvarInterno(tx, c, {
          data,
          desconto: 10_000,
          observacoes: 'Inclui decoração azul',
          observacoesInternas: 'SEGREDO-INTERNO-123',
          descontoMotivo: 'MOTIVO-DESCONTO-456',
        }),
      );
      const [p] = await comoAnon(tx, () => tx`select publico.proposta(${c.slug}, ${o.token}) as p`);
      const json = JSON.stringify(p!.p);
      expect(json).toContain('Inclui decoração azul');
      expect(json).not.toContain('SEGREDO-INTERNO-123');
      expect(json).not.toContain('MOTIVO-DESCONTO-456');
      expect(json).not.toContain(IDS.donoA);
    });
  });

  it('isolamento: outra empresa não edita nem pré-reserva', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const o = await comoDono(tx, () => salvarInterno(tx, c, { data }));
      await comoDono(
        tx,
        async () => {
          await esperarMensagem(
            tx,
            () => salvarInterno(tx, c, { data, orcamentoId: o.id }),
            'ORCAMENTO_NAO_ENCONTRADO',
          );
          await esperarMensagem(
            tx,
            () => tx`select public.pre_reservar_orcamento(${o.id})`,
            'ORCAMENTO_NAO_ENCONTRADO',
          );
          await esperarMensagem(
            tx,
            () => tx`select public.marcar_orcamento_enviado(${o.id}, 'whatsapp')`,
            'ORCAMENTO_NAO_ENCONTRADO',
          );
        },
        IDS.donoB,
      );
    });
  });
});

describe('pré-reserva a partir do orçamento e versões com reserva', () => {
  async function preReservado(tx: Tx, c: Cenario, data: string) {
    const o = await comoDono(tx, () => salvarInterno(tx, c, { data }));
    await comoDono(tx, () => tx`select public.pre_reservar_orcamento(${o.id})`);
    return o;
  }
  const reservasDo = (tx: Tx, c: Cenario) =>
    tx`select r.data::text, r.status, r.tipo, r.origem, r.convidados, o.versao
      from public.reservas r join public.orcamentos o on o.id = r.orcamento_id
      where r.espaco_id = ${c.espaco} order by r.data, r.status`;

  it('pré-reserva com origem orçamento; antecedência só com fora_antecedencia', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      await tx`update public.regras_comerciais set antecedencia_min_dias = 10 where empresa_id = ${IDS.empresaA}`;
      const perto = await dataDaqui(tx, 3);
      const o = await comoDono(tx, () => salvarInterno(tx, c, { data: perto }));
      await comoDono(tx, () =>
        esperarMensagem(
          tx,
          () => tx`select public.pre_reservar_orcamento(${o.id})`,
          'ORCAMENTO_ANTECEDENCIA',
        ),
      );
      const ciente = await comoDono(tx, () =>
        salvarInterno(tx, c, { data: perto, orcamentoId: o.id, foraAntecedencia: true }),
      );
      await comoDono(
        tx,
        () => tx`select public.pre_reservar_orcamento(${ciente.id})`,
        IDS.vendedorA,
      );
      const rs = await reservasDo(tx, c);
      expect(rs).toEqual([
        {
          data: perto,
          status: 'ativa',
          tipo: 'pre_reserva',
          origem: 'orcamento',
          convidados: 50,
          versao: 2,
        },
      ]);
    });
  });

  it('só convidados mudaram: a reserva continua e aponta para a versão nova', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const o = await preReservado(tx, c, data);
      const v2 = await comoDono(tx, () =>
        salvarInterno(tx, c, { data, orcamentoId: o.id, convidados: 80 }),
      );
      const rs = await reservasDo(tx, c);
      expect(rs).toEqual([
        {
          data,
          status: 'ativa',
          tipo: 'pre_reserva',
          origem: 'orcamento',
          convidados: 80,
          versao: 2,
        },
      ]);
      const [s] = await tx`select status from public.orcamentos where id = ${v2.id}`;
      expect(s!.status).toBe('aceito');
    });
  });

  it('data mudou para slot livre: troca atômica; para slot ocupado: nada muda', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const d1 = await dataDaqui(tx, 200);
      const d2 = await dataDaqui(tx, 205);
      const d3 = await dataDaqui(tx, 210);
      const o = await preReservado(tx, c, d1);
      const v2 = await comoDono(tx, () => salvarInterno(tx, c, { data: d2, orcamentoId: o.id }));
      let rs = await reservasDo(tx, c);
      expect(rs.map((r) => [r.data, r.status, r.versao])).toEqual([
        [d1, 'cancelada', 1],
        [d2, 'ativa', 2],
      ]);
      // d3 ocupada por outro evento: a versão 3 é recusada e a pré-reserva de d2 continua
      await comoDono(
        tx,
        () =>
          tx`select public.criar_reserva(${c.espaco}, ${c.turno}, ${d3}::date, 'confirmada', 'Outro')`,
      );
      await comoDono(tx, () =>
        esperarMensagem(
          tx,
          () => salvarInterno(tx, c, { data: d3, orcamentoId: v2.id }),
          'AGENDA_SLOT_OCUPADO',
        ),
      );
      rs = await reservasDo(tx, c);
      expect(rs.filter((r) => r.status === 'ativa').map((r) => [r.data, r.versao])).toEqual([
        [d2, 2],
      ]);
      const vs = await tx`select versao, status from public.orcamentos where numero = ${o.numero}
        and empresa_id = ${IDS.empresaA} order by versao`;
      expect(vs.map((v) => v.versao)).toEqual([1, 2]);
    });
  });

  it('reserva confirmada não muda de data por orçamento', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const d1 = await dataDaqui(tx, 200);
      const o = await preReservado(tx, c, d1);
      await comoDono(tx, async () => {
        const [r] = await tx`select id from public.reservas where orcamento_id = ${o.id}`;
        await tx`select public.confirmar_reserva(${r!.id}, 100000)`;
        // outra data de verdade (se d1 já cair num dia 28, troca para 27)
        const d2 = d1.replace(/..$/, d1.endsWith('28') ? '27' : '28');
        await esperarMensagem(
          tx,
          () => salvarInterno(tx, c, { data: d2, orcamentoId: o.id }),
          'ORCAMENTO_RESERVA_CONFIRMADA',
        );
      });
    });
  });
});

describe('rastreio de aberturas', () => {
  it('usuário da empresa não conta; atividade 1x por 30 min; 2 aberturas em 3 dias = quente', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const o = await comoDono(tx, () =>
        salvarInterno(tx, c, { data, whatsapp: '+5534990055099' }),
      );
      const abrir = (eh: boolean, ip = 'ip-abre') =>
        comoAnon(
          tx,
          () => tx`select publico.registrar_abertura(${c.slug}, ${o.token}, ${eh}, ${ip})`,
        );
      await abrir(true);
      let [st] = await tx`select aberturas, status from public.orcamentos where id = ${o.id}`;
      expect(st).toEqual({ aberturas: 0, status: 'enviado' });

      await abrir(false);
      await abrir(false);
      [st] = await tx`select aberturas, status from public.orcamentos where id = ${o.id}`;
      expect(st).toEqual({ aberturas: 2, status: 'visualizado' });
      let ativ = await tx`select count(*)::int as n from public.atividades
        where orcamento_id = ${o.id} and tipo = 'proposta_aberta'`;
      expect(ativ[0]!.n).toBe(1);
      let [l] = await tx`select temperatura from public.leads where id = ${o.lead_id}`;
      expect(l!.temperatura).toBe('morno');

      // uma abertura de ontem + a de agora (depois de 30 min) = quente
      await tx`update public.atividades set criado_em = now() - interval '1 day'
        where orcamento_id = ${o.id} and tipo = 'proposta_aberta'`;
      await abrir(false);
      ativ = await tx`select count(*)::int as n from public.atividades
        where orcamento_id = ${o.id} and tipo = 'proposta_aberta'`;
      expect(ativ[0]!.n).toBe(2);
      [l] = await tx`select temperatura from public.leads where id = ${o.lead_id}`;
      expect(l!.temperatura).toBe('quente');
    });
  });

  it('limite por IP é silencioso', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const o = await comoDono(tx, () => salvarInterno(tx, c, { data }));
      await tx`insert into publico.tentativas (acao, chave_tipo, chave_hash, empresa_id)
        select 'abertura', 'ip', 'ip-cheio', ${IDS.empresaA} from generate_series(1, 120)`;
      await comoAnon(
        tx,
        () => tx`select publico.registrar_abertura(${c.slug}, ${o.token}, false, 'ip-cheio')`,
      );
      const [st] = await tx`select aberturas from public.orcamentos where id = ${o.id}`;
      expect(st!.aberturas).toBe(0);
    });
  });
});

describe('expiração e atualizar preços', () => {
  it('job marca expirada e esfria o lead; a leitura já trata como expirada', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const a = await comoDono(tx, () =>
        salvarInterno(tx, c, { data, whatsapp: '+5534990055101' }),
      );
      const b = await comoDono(tx, () =>
        salvarInterno(tx, c, { data, whatsapp: '+5534990055102' }),
      );
      await tx`update public.orcamentos set validade_ate = (now() at time zone 'America/Sao_Paulo')::date - 1 where id in ${tx([a.id, b.id])}`;
      // leitura antes do job
      const [p] = await comoAnon(tx, () => tx`select publico.proposta(${c.slug}, ${a.token}) as p`);
      expect(p!.p.status).toBe('expirado');
      // job pega o resto
      const [n] = await tx`select public.expirar_orcamentos() as n`;
      expect(n!.n).toBeGreaterThanOrEqual(1);
      const linhas = await tx`select o.status, l.status as lead from public.orcamentos o
        join public.leads l on l.id = o.lead_id where o.id in ${tx([a.id, b.id])}`;
      expect(linhas.map((x) => [x.status, x.lead])).toEqual([
        ['expirado', 'frio'],
        ['expirado', 'frio'],
      ]);
    });
  });

  it('atualizar preços: só para vencida, cria versão nova', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const o = await comoDono(tx, () => salvarInterno(tx, c, { data }));
      const validade = await dataDaqui(tx, 15);
      const chamar = () =>
        (async () => {
          const [r] = await tx`select publico.atualizar_precos(${c.slug}, ${o.token},
            ${tx.json({ versaoMotor: 1, ok: true, totalCentavos: 700_000 })},
            ${tx.json([{ tipo: 'pacote', descricao: 'Pacote', quantidade: 1, valorUnitarioCentavos: 700_000, subtotalCentavos: 700_000, detalhe: '' }])},
            700000, ${validade}::date, ${tx.json({})}, ${c.tipo}, ${data}::date, ${c.turno},
            ${c.espaco}, 50, null, ${tx.json({})}) as t`;
          return r!.t as string;
        })();
      await comoAnon(tx, () => esperarMensagem(tx, chamar, 'PUBLICO_ORCAMENTO_VIGENTE'));
      await tx`update public.orcamentos set validade_ate = (now() at time zone 'America/Sao_Paulo')::date - 1 where id = ${o.id}`;
      const novo = await comoAnon(tx, chamar);
      const vs = await versoes(tx, IDS.empresaA, o.numero);
      expect(vs.map((v) => [v.versao, v.status, v.total_centavos])).toEqual([
        [1, 'substituido', 500_000],
        [2, 'enviado', 700_000],
      ]);
      expect(vs[1]!.token).toBe(novo);
    });
  });
});

describe('concorrência de versões (duas conexões reais)', () => {
  it('duas edições ao mesmo tempo: só uma vira a versão 2', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    const conexaoA = conectar();
    const conexaoB = conectar();
    try {
      const c = await cenarioPublico(sql, e.empresaId);
      const data = await dataDaqui(sql, 60);
      const base = await sql.begin(async (tx) => {
        await assumirUsuario(tx, e.donoId);
        return salvarInterno(tx, c, { data, whatsapp: '+5534990055201' });
      });
      const editar = (conexao: postgres.Sql, segurar?: Promise<void>) =>
        conexao.begin(async (tx) => {
          await assumirUsuario(tx, e.donoId);
          const r = await salvarInterno(tx, c, { data, orcamentoId: base.id, convidados: 70 });
          if (segurar) await segurar;
          return r;
        });
      let liberar!: () => void;
      const segurando = new Promise<void>((ok) => (liberar = ok));
      const a = editar(conexaoA, segurando);
      await new Promise((ok) => setTimeout(ok, 300));
      const b = editar(conexaoB);
      await new Promise((ok) => setTimeout(ok, 300));
      liberar();
      const resultados = await Promise.allSettled([a, b]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const falha = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(falha.reason.message).toBe('ORCAMENTO_VERSAO_ANTIGA');
      const vs = await versoes(sql, e.empresaId, base.numero);
      expect(vs.map((v) => [v.versao, v.status])).toEqual([
        [1, 'substituido'],
        [2, 'enviado'],
      ]);
    } finally {
      await conexaoA.end();
      await conexaoB.end();
      await removerEmpresa(sql, e);
    }
  });
});

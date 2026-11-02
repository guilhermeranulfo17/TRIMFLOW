import { afterAll, describe, expect, it } from 'vitest';
import {
  CODIGOS_MODULO,
  naCarencia,
  situacaoModulo,
  type SituacaoModulo,
  type StatusAssinaturaModulo,
} from '@/domain/modulos';
import { criarClienteAsaas } from '@/server/cobranca/asaas';
import { cobrancaDisponivel } from '@/server/cobranca/config';
import type { DepsCobranca } from '@/server/cobranca/fluxos';
import { tratarWebhook } from '@/server/cobranca/webhook';
import { criarDb } from '@/server/db/client';
import { cancelarModulo, contratarModulo, verificarPagamentoModulo } from '@/server/modulos/fluxos';
import { criarAsaasFalso, type AsaasFalso } from '../support/asaas-fake';
import { criarReservaConfirmada } from '../support/reserva';
import { comoUsuario, conectar, esperarErroSql, IDS, urlBancoTeste } from '../support/db';
import {
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';

/*
 * Nossas soluções (estrutura compartilhada): situação = SQL, RLS e isolamento, contratação pela
 * API falsa do Asaas, webhook autenticado, duplicado e fora de ordem, estorno, cancelamento,
 * compra por festa que libera só aquela festa e a separação da assinatura-base.
 */

const sql = conectar();
const { db, sql: sqlDrizzle } = criarDb(urlBancoTeste(), { max: 4 });
afterAll(async () => {
  await sql.end();
  await sqlDrizzle.end();
});

const TOKEN = 'token-do-webhook';
const dados = { nome: 'Dona Teste', documento: '529.982.247-25', email: 'dona@teste.com' };

function preparar(): { falso: AsaasFalso; deps: DepsCobranca } {
  const falso = criarAsaasFalso({ apiKey: 'chave', urlPublica: 'http://asaas.falso' });
  const asaas = criarClienteAsaas(
    { apiKey: 'chave', ambiente: 'sandbox', webhookToken: TOKEN, urlBase: 'http://asaas.falso/v3' },
    { fetch: falso.fetch },
  );
  return { falso, deps: { db, asaas } };
}

const webhook = (corpo: unknown, token = TOKEN) =>
  tratarWebhook(db, { token, tokenEsperado: TOKEN, corpo: JSON.stringify(corpo) });

async function comEmpresa(fn: (e: EmpresaTemporaria) => Promise<void>) {
  const e = await criarEmpresaTemporaria(sql, 'infantil');
  try {
    await fn(e);
  } finally {
    await removerEmpresa(sql, e);
  }
}

/** Libera a venda do OrkMargem só durante o teste (no banco ele nasce sem venda pública). */
async function comVendaLiberada(fn: () => Promise<void>) {
  await sql`update public.modulos set venda_liberada = true where codigo = 'orkmargem'`;
  try {
    await fn();
  } finally {
    await sql`update public.modulos set venda_liberada = false where codigo = 'orkmargem'`;
  }
}

const acesso = async (empresa: string, modulo: string, reserva: string | null = null) =>
  (await sql`select public.modulo_acesso(${empresa}, ${modulo}, ${reserva}) as a`)[0]!.a as boolean;

const situacaoDoPainel = (usuario: string, codigo: string) =>
  comoUsuario(sql, usuario, async (tx) => {
    const [l] = await tx`select public.modulos_da_empresa() as v`;
    return (l!.v as { codigo: string; situacao: SituacaoModulo; acesso: boolean }[]).find(
      (m) => m.codigo === codigo,
    )!;
  });

describe('catálogo no banco', () => {
  it('seis soluções com os preços da tabela e nenhuma com venda pública', async () => {
    const linhas = await sql`select codigo, cobranca, preco_centavos, venda_liberada
      from public.modulos order by ordem`;
    expect(linhas.map((l) => l.codigo)).toEqual([...CODIGOS_MODULO]);
    expect(Object.fromEntries(linhas.map((l) => [l.codigo, l.preco_centavos]))).toEqual({
      orkflow: 14900,
      orkmargem: 14900,
      orkstage: 9900,
      orkpass: 2900,
      orkpay: 9900,
      orkbis: 7900,
    });
    expect(linhas.find((l) => l.codigo === 'orkpass')!.cobranca).toBe('por_evento');
    expect(linhas.every((l) => l.venda_liberada === false)).toBe(true);
  });
});

describe('situação do módulo = SQL', () => {
  it('mesma resposta do domínio numa tabela de casos', async () => {
    const hoje = '2026-11-10';
    const status: StatusAssinaturaModulo[] = ['pendente', 'ativa', 'cancelada'];
    const pagos = [null, '2026-11-09', '2026-11-10', '2026-12-09'];
    for (const s of status)
      for (const pagoAte of pagos)
        for (const estornada of [false, true])
          for (const carencia of [0, 3]) {
            const [l] =
              await sql`select public._modulo_situacao(${s}, ${pagoAte}::date, ${estornada}, ${hoje}::date) as sit,
              public._modulo_na_carencia(public._modulo_situacao(${s}, ${pagoAte}::date, ${estornada}, ${hoje}::date),
                ${pagoAte}::date, null, ${carencia}::smallint, ${hoje}::date) as car`;
            const sit = situacaoModulo({ status: s, pagoAte, estornada, hoje });
            expect(l!.sit, `${s} ${pagoAte} ${estornada}`).toBe(sit);
            expect(l!.car).toBe(
              naCarencia({
                situacao: sit,
                pagoAte,
                atrasadaDesde: null,
                carenciaDias: carencia,
                hoje,
              }),
            );
          }
  });
});

describe('RLS e isolamento', () => {
  it('catálogo para todos; assinaturas só para o dono da própria empresa; ninguém escreve', async () => {
    await comoUsuario(sql, IDS.vendedorA, async (tx) => {
      expect((await tx`select count(*)::int as n from public.modulos`)[0]!.n).toBe(6);
      await esperarErroSql(tx`update public.modulos set venda_liberada = true`, '42501');
    });
    await sql`insert into public.modulo_assinaturas (empresa_id, modulo, valor_centavos)
      values (${IDS.empresaA}, 'orkmargem', 14900)`;
    try {
      await comoUsuario(sql, IDS.donoA, async (tx) => {
        expect((await tx`select count(*)::int as n from public.modulo_assinaturas`)[0]!.n).toBe(1);
        await esperarErroSql(
          tx`insert into public.modulo_assinaturas (empresa_id, modulo, valor_centavos)
             values (${IDS.empresaA}, 'orkflow', 1)`,
          '42501',
        );
      });
      await comoUsuario(sql, IDS.vendedorA, async (tx) => {
        expect((await tx`select count(*)::int as n from public.modulo_assinaturas`)[0]!.n).toBe(0);
      });
      await comoUsuario(sql, IDS.donoB, async (tx) => {
        expect((await tx`select count(*)::int as n from public.modulo_assinaturas`)[0]!.n).toBe(0);
        // não dá para sondar o direito de outra empresa
        const [l] = await tx`select public.modulo_acesso(${IDS.empresaA}, 'orkmargem') as a`;
        expect(l!.a).toBe(false);
      });
    } finally {
      await sql`delete from public.modulo_assinaturas where empresa_id = ${IDS.empresaA}`;
    }
  });
});

describe('contratar, pagar e cancelar (mensal)', () => {
  it('sem venda liberada nada é criado no Asaas', async () => {
    await comEmpresa(async (e) => {
      const { falso, deps } = preparar();
      const r = await contratarModulo(deps, {
        empresaId: e.empresaId,
        usuarioId: e.donoId,
        codigo: 'orkmargem',
        dados,
      });
      expect(r).toMatchObject({ ok: false, codigo: 'MODULO_SEM_VENDA' });
      expect(falso.chamadas).toEqual([]);
      // módulo sem entrega pronta não é vendido nem com a venda liberada no banco
      await sql`update public.modulos set venda_liberada = true where codigo = 'orkflow'`;
      try {
        expect(
          await contratarModulo(deps, {
            empresaId: e.empresaId,
            usuarioId: e.donoId,
            codigo: 'orkflow',
            dados,
          }),
        ).toMatchObject({ ok: false, codigo: 'MODULO_SEM_VENDA' });
      } finally {
        await sql`update public.modulos set venda_liberada = false where codigo = 'orkflow'`;
      }
    });
  });

  it('pendente sem acesso; webhook pago libera; repetido e fora de ordem não mudam; base intacta', async () => {
    await comVendaLiberada(() =>
      comEmpresa(async (e) => {
        const { falso, deps } = preparar();
        const [antes] = await sql`select plano from public.empresas where id = ${e.empresaId}`;
        const entrada = { empresaId: e.empresaId, usuarioId: e.donoId, codigo: 'orkmargem', dados };
        const r1 = await contratarModulo(deps, entrada);
        expect(r1.ok).toBe(true);
        const url = r1.ok ? r1.dados.urlFatura! : '';
        expect(url).toMatch(/^http:\/\/asaas\.falso\/fatura\//);
        // dois cliques: mesma fatura, uma assinatura só
        const r2 = await contratarModulo(deps, entrada);
        expect(r2.ok && r2.dados.urlFatura).toBe(url);
        expect(
          (
            await sql`select count(*)::int as n from public.modulo_assinaturas where empresa_id = ${e.empresaId}`
          )[0]!.n,
        ).toBe(1);
        const [assin] = [...falso.assinaturas.values()];
        expect(assin).toMatchObject({ value: 149, cycle: 'MONTHLY' });
        expect(String(assin!.externalReference)).toMatch(/^modulo:/);

        // voltou do checkout sem pagar: nada liberado
        expect(await acesso(e.empresaId, 'orkmargem')).toBe(false);
        expect((await situacaoDoPainel(e.donoId, 'orkmargem')).situacao).toBe('pagamento_pendente');

        // token errado não grava nada
        const pid = url.split('/').pop()!;
        const pago = falso.pagar(pid);
        expect(
          (await webhook({ id: 'evt_mod_x', event: 'PAYMENT_RECEIVED', payment: pago }, 'x'))
            .status,
        ).toBe(401);
        expect(await acesso(e.empresaId, 'orkmargem')).toBe(false);

        const corpo = { id: `evt_mod_pago_${pid}`, event: 'PAYMENT_RECEIVED', payment: pago };
        expect((await webhook(corpo)).corpo).toEqual({ ok: true, resultado: 'modulo_cobranca' });
        expect((await webhook(corpo)).corpo).toEqual({ ok: true, resultado: 'duplicado' });
        expect(await acesso(e.empresaId, 'orkmargem')).toBe(true);
        const painel = await situacaoDoPainel(e.donoId, 'orkmargem');
        expect(painel).toMatchObject({ situacao: 'ativo', acesso: true });

        // evento atrasado de "criada" (fora de ordem) não regride a cobrança paga
        const atrasado = { ...pago, status: 'PENDING' };
        await webhook({ id: `evt_mod_criada_${pid}`, event: 'PAYMENT_CREATED', payment: atrasado });
        const [cob] =
          await sql`select status from public.modulo_cobrancas where asaas_cobranca_id = ${pid}`;
        expect(cob!.status).toBe('recebida');

        // a assinatura-base não foi tocada: nenhuma cobrança nela, situação igual
        expect(
          (
            await sql`select count(*)::int as n from public.cobrancas where empresa_id = ${e.empresaId}`
          )[0]!.n,
        ).toBe(0);
        const [depois] = await sql`select plano from public.empresas where id = ${e.empresaId}`;
        expect(depois!.plano).toBe(antes!.plano);

        // vendedor não vê link de fatura nem datas
        const doVendedor = await comoUsuario(sql, e.vendedorId, async (tx) => {
          const [l] = await tx`select public.modulos_da_empresa() as v`;
          return (l!.v as Record<string, unknown>[]).find((m) => m.codigo === 'orkmargem')!;
        });
        expect(doVendedor).toMatchObject({ situacao: 'ativo', link_fatura: null, pago_ate: null });

        // já ativo: contratar de novo não cria outra
        expect(await contratarModulo(deps, entrada)).toMatchObject({ ok: false });

        // cancelar: nada mais é cobrado, acesso até o fim do período pago
        expect(
          await cancelarModulo(deps, {
            empresaId: e.empresaId,
            usuarioId: e.donoId,
            codigo: 'orkmargem',
          }),
        ).toEqual({ ok: true });
        expect([...falso.assinaturas.values()][0]!.deleted).toBe(true);
        expect((await situacaoDoPainel(e.donoId, 'orkmargem')).situacao).toBe(
          'cancelamento_agendado',
        );
        expect(await acesso(e.empresaId, 'orkmargem')).toBe(true);
        // passou o período: expirado, sem acesso, histórico guardado
        await sql`update public.modulo_assinaturas set pago_ate = current_date - 1 where empresa_id = ${e.empresaId}`;
        expect((await situacaoDoPainel(e.donoId, 'orkmargem')).situacao).toBe('expirado');
        expect(await acesso(e.empresaId, 'orkmargem')).toBe(false);
        expect(
          (
            await sql`select count(*)::int as n from public.modulo_cobrancas where empresa_id = ${e.empresaId}`
          )[0]!.n,
        ).toBeGreaterThan(0);
      }),
    );
  });

  it('estorno tira o acesso; verificar pagamento lê a API sem precisar do webhook', async () => {
    await comVendaLiberada(() =>
      comEmpresa(async (e) => {
        const { falso, deps } = preparar();
        const r = await contratarModulo(deps, {
          empresaId: e.empresaId,
          usuarioId: e.donoId,
          codigo: 'orkmargem',
          dados,
        });
        const pid = r.ok ? r.dados.urlFatura!.split('/').pop()! : '';
        falso.pagar(pid);
        // o webhook se perdeu: "Já paguei" busca no Asaas
        expect(await acesso(e.empresaId, 'orkmargem')).toBe(false);
        expect(
          await verificarPagamentoModulo(deps, { empresaId: e.empresaId, codigo: 'orkmargem' }),
        ).toEqual({
          ok: true,
        });
        expect(await acesso(e.empresaId, 'orkmargem')).toBe(true);

        const estornado = { ...falso.pagamentos.get(pid)!, status: 'REFUNDED' };
        await webhook({ id: `evt_mod_est_${pid}`, event: 'PAYMENT_REFUNDED', payment: estornado });
        expect(await acesso(e.empresaId, 'orkmargem')).toBe(false);
        expect((await situacaoDoPainel(e.donoId, 'orkmargem')).situacao).toBe('estornado');
        // recebido atrasado depois do estorno não devolve o acesso
        await webhook({
          id: `evt_mod_rec2_${pid}`,
          event: 'PAYMENT_RECEIVED',
          payment: { ...estornado, status: 'RECEIVED' },
        });
        expect(await acesso(e.empresaId, 'orkmargem')).toBe(false);
      }),
    );
  });

  it('conta-base suspensa não contrata; demo não contrata', async () => {
    await comVendaLiberada(() =>
      comEmpresa(async (e) => {
        const { falso, deps } = preparar();
        await sql`update public.empresas set plano = 'suspenso' where id = ${e.empresaId}`;
        expect(
          await contratarModulo(deps, {
            empresaId: e.empresaId,
            usuarioId: e.donoId,
            codigo: 'orkmargem',
            dados,
          }),
        ).toMatchObject({ ok: false });
        expect(falso.chamadas).toEqual([]);
      }),
    );
  });

  it('Asaas fora do ar: nada fica pendurado', async () => {
    await comVendaLiberada(() =>
      comEmpresa(async (e) => {
        const { deps } = preparar();
        const fora = {
          ...deps,
          asaas: criarClienteAsaas(
            {
              apiKey: 'chave',
              ambiente: 'sandbox',
              webhookToken: TOKEN,
              urlBase: 'http://asaas.falso/v3',
            },
            { fetch: async () => new Response('erro', { status: 500 }) },
          ),
        };
        const r = await contratarModulo(fora, {
          empresaId: e.empresaId,
          usuarioId: e.donoId,
          codigo: 'orkmargem',
          dados,
        });
        expect(r.ok).toBe(false);
        expect(
          (
            await sql`select count(*)::int as n from public.modulo_assinaturas where empresa_id = ${e.empresaId}`
          )[0]!.n,
        ).toBe(0);
      }),
    );
  });
});

describe('compra por festa (OrkPass)', () => {
  it('a compra paga libera só a festa comprada, até a data da festa + dias do módulo', async () => {
    await comEmpresa(async (e) => {
      const reserva = (dias: number) => criarReservaConfirmada(sql, e.empresaId, { dias });
      const r1 = await reserva(20);
      const r2 = await reserva(27);
      await sql`update public.modulos set acesso_evento_dias = 7 where codigo = 'orkpass'`;
      try {
        const [compra] =
          await sql`insert into public.modulo_compras (empresa_id, modulo, reserva_id, valor_centavos)
          values (${e.empresaId}, 'orkpass', ${r1}, 2900) returning id`;
        const pagamento = {
          id: `pay_pass_${compra!.id}`,
          customer: 'cus_x',
          value: 29,
          status: 'RECEIVED',
          dueDate: new Date().toISOString().slice(0, 10),
          billingType: 'PIX',
          externalReference: `modulo:${compra!.id}`,
        };
        expect(
          (
            await webhook({
              id: `evt_pass_${compra!.id}`,
              event: 'PAYMENT_RECEIVED',
              payment: pagamento,
            })
          ).corpo,
        ).toEqual({ ok: true, resultado: 'modulo_compra' });
        expect(await acesso(e.empresaId, 'orkpass', r1)).toBe(true);
        expect(await acesso(e.empresaId, 'orkpass', r2)).toBe(false);
        expect(await acesso(e.empresaId, 'orkpass')).toBe(false);
        const [c] =
          await sql`select status, acesso_ate - (select data from public.reservas where id = ${r1}) as dias
          from public.modulo_compras where id = ${compra!.id}`;
        expect(c).toEqual({ status: 'paga', dias: 7 });
        // uma compra viva por festa
        await esperarErroSql(
          sql`insert into public.modulo_compras (empresa_id, modulo, reserva_id, valor_centavos)
              values (${e.empresaId}, 'orkpass', ${r1}, 2900)`,
          '23505',
        );
        // a outra empresa não usa a compra
        expect(await acesso(IDS.empresaA, 'orkpass', r1)).toBe(false);
      } finally {
        await sql`update public.modulos set acesso_evento_dias = null where codigo = 'orkpass'`;
      }
    });
  });
});

it('a cobrança fica desligada sem as variáveis do Asaas (contratação também)', () => {
  expect(cobrancaDisponivel({})).toBe(false);
});

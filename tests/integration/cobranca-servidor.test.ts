import { afterAll, describe, expect, it } from 'vitest';
import { criarClienteAsaas } from '@/server/cobranca/asaas';
import {
  aplicarCupom,
  assinar,
  cancelarAssinatura,
  criarImplantacao,
  ERRO_ASAAS,
  mudarPlano,
  reconciliar,
  type DepsCobranca,
} from '@/server/cobranca/fluxos';
import { tratarWebhook } from '@/server/cobranca/webhook';
import { criarDb } from '@/server/db/client';
import { criarAsaasFalso, type AsaasFalso } from '../support/asaas-fake';
import { conectar, urlBancoTeste } from '../support/db';
import {
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';

/*
 * Fluxos da cobrança contra a API falsa do Asaas e o banco real: assinar (com cupom e dois
 * cliques), webhook (token, tamanho, JSON, repetido), mudar de plano, cancelar, reconciliação,
 * implantação, cupom pelo /interno e Asaas fora do ar.
 */

const sql = conectar();
const { db, sql: sqlDrizzle } = criarDb(urlBancoTeste(), { max: 4 });
afterAll(async () => {
  await sql.end();
  await sqlDrizzle.end();
});

const TOKEN = 'token-do-webhook';
const dados = { nome: 'Dona Teste', documento: '529.982.247-25', email: 'Dona@Teste.com' };

function preparar(): { falso: AsaasFalso; deps: DepsCobranca } {
  const falso = criarAsaasFalso({ apiKey: 'chave', urlPublica: 'http://asaas.falso' });
  const asaas = criarClienteAsaas(
    { apiKey: 'chave', ambiente: 'sandbox', webhookToken: TOKEN, urlBase: 'http://asaas.falso/v3' },
    { fetch: falso.fetch },
  );
  return { falso, deps: { db, asaas } };
}

async function comEmpresa(
  fn: (e: EmpresaTemporaria) => Promise<void>,
  o: { trialDias?: number } = {},
) {
  const e = await criarEmpresaTemporaria(sql, 'infantil');
  await sql`update public.empresas set trial_ate = now() + make_interval(days => ${o.trialDias ?? -1})
    where id = ${e.empresaId}`;
  await sql`select public._atualizar_situacao(${e.empresaId})`;
  try {
    await fn(e);
  } finally {
    await removerEmpresa(sql, e);
  }
}

const situacao = async (empresa: string) =>
  (await sql`select plano from public.empresas where id = ${empresa}`)[0]!.plano as string;

const webhook = (corpo: unknown, token = TOKEN) =>
  tratarWebhook(db, { token, tokenEsperado: TOKEN, corpo: JSON.stringify(corpo) });

describe('webhook', () => {
  it('token errado, corpo grande, JSON inválido e payload inválido', async () => {
    expect((await webhook({ id: 'x', event: 'PAYMENT_CREATED' }, 'errado')).status).toBe(401);
    expect(
      (await tratarWebhook(db, { token: TOKEN, tokenEsperado: undefined, corpo: '{}' })).status,
    ).toBe(401);
    expect(
      (await tratarWebhook(db, { token: null, tokenEsperado: TOKEN, corpo: '{}' })).status,
    ).toBe(401);
    expect(
      (await tratarWebhook(db, { token: TOKEN, tokenEsperado: TOKEN, corpo: 'x'.repeat(70_000) }))
        .status,
    ).toBe(413);
    expect(
      (await tratarWebhook(db, { token: TOKEN, tokenEsperado: TOKEN, corpo: '{' })).status,
    ).toBe(400);
    expect((await webhook({ event: 'PAYMENT_CREATED' })).status).toBe(400);
  });
});

describe('assinar e pagar', () => {
  it('cupom de fundador, dois cliques, fatura, webhook repetido → conta ativa a R$ 97', async () => {
    await comEmpresa(async (e) => {
      const { falso, deps } = preparar();
      expect(await situacao(e.empresaId)).toBe('suspenso');
      const entrada = {
        empresaId: e.empresaId,
        usuarioId: e.donoId,
        plano: 'profissional',
        ciclo: 'mensal' as const,
        cupom: ' fundador ',
        dados,
      };
      const r1 = await assinar(deps, entrada);
      expect(r1).toMatchObject({
        ok: true,
        dados: { urlFatura: expect.stringMatching(/^http:\/\/asaas\.falso\/fatura\/pay_/) },
      });
      const r2 = await assinar(deps, entrada);
      expect(r2).toEqual(r1);
      expect(falso.assinaturas.size).toBe(1);
      const [sub] = [...falso.assinaturas.values()];
      expect(sub).toMatchObject({
        value: 97,
        cycle: 'MONTHLY',
        billingType: 'UNDEFINED',
        externalReference: e.empresaId,
      });
      const [cliente] = [...falso.clientes.values()];
      expect(cliente).toMatchObject({ cpfCnpj: '52998224725', email: 'Dona@Teste.com' });

      const [a] =
        await sql`select status, valor_centavos, cupom_codigo, cupom_ate::text from public.assinaturas
        where empresa_id = ${e.empresaId}`;
      expect(a).toMatchObject({
        status: 'pendente',
        valor_centavos: 9700,
        cupom_codigo: 'FUNDADOR',
      });
      expect(
        await sql`select 1 from public.cupons_usos where empresa_id = ${e.empresaId}`,
      ).toHaveLength(1);
      const [ec] =
        await sql`select documento, email from public.empresas_cobranca where empresa_id = ${e.empresaId}`;
      expect(ec).toEqual({ documento: '52998224725', email: 'dona@teste.com' });
      const [aud] = await sql`select dados from public.auditoria where empresa_id = ${e.empresaId}
        and acao = 'assinatura.criada'`;
      expect(aud!.dados).toMatchObject({
        plano: 'profissional',
        valor_centavos: 9700,
        cupom: 'FUNDADOR',
      });

      // paga na página do Asaas → webhook (duas vezes, como o Asaas pode mandar)
      const pid = r1.ok ? r1.dados.urlFatura!.split('/').pop()! : '';
      const pago = falso.pagar(pid);
      const corpo = { id: 'evt_pago_1', event: 'PAYMENT_RECEIVED', payment: pago };
      expect(await webhook(corpo)).toEqual({
        status: 200,
        corpo: { ok: true, resultado: 'cobranca' },
      });
      expect(await webhook(corpo)).toEqual({
        status: 200,
        corpo: { ok: true, resultado: 'duplicado' },
      });
      expect(await situacao(e.empresaId)).toBe('ativo');
      const [cob] =
        await sql`select status, valor_centavos from public.cobrancas where asaas_cobranca_id = ${pid}`;
      expect(cob).toEqual({ status: 'recebida', valor_centavos: 9700 });
      // payload gravado sem dados pessoais
      const [ev] =
        await sql`select payload from public.cobranca_eventos where asaas_evento_id = 'evt_pago_1'`;
      expect(JSON.stringify(ev!.payload)).not.toContain('52998224725');

      // já ativa: assinar de novo não cria outra
      expect(await assinar(deps, { ...entrada, cupom: null })).toMatchObject({ ok: false });
    });
  });

  it('dados inválidos, cupom de outro plano e Asaas fora do ar', async () => {
    await comEmpresa(async (e) => {
      const { deps } = preparar();
      const base = {
        empresaId: e.empresaId,
        usuarioId: e.donoId,
        plano: 'essencial',
        ciclo: 'mensal' as const,
        dados,
      };
      expect(await assinar(deps, { ...base, dados: { ...dados, documento: '123' } })).toEqual({
        ok: false,
        erro: 'CPF ou CNPJ inválido. Confira os números.',
      });
      expect(await assinar(deps, { ...base, cupom: 'FUNDADOR' })).toMatchObject({
        ok: false,
        codigo: 'CUPOM',
        erro: 'Este cupom vale só para o plano Profissional mensal.',
      });
      const fora = criarClienteAsaas(
        {
          apiKey: 'chave',
          ambiente: 'sandbox',
          webhookToken: TOKEN,
          urlBase: 'http://asaas.falso/v3',
        },
        {
          fetch: (async () => {
            throw new Error('rede');
          }) as typeof fetch,
        },
      );
      expect(await assinar({ db, asaas: fora }, base)).toEqual({
        ok: false,
        erro: ERRO_ASAAS,
        codigo: 'ASAAS_REDE',
      });
      expect(await sql`select 1 from public.assinaturas where empresa_id = ${e.empresaId}`).toEqual(
        [],
      );
    });
  });

  it('assinando no teste: 1º vencimento no fim do teste (não perde dias)', async () => {
    await comEmpresa(
      async (e) => {
        const { falso, deps } = preparar();
        await assinar(deps, {
          empresaId: e.empresaId,
          usuarioId: e.donoId,
          plano: 'essencial',
          ciclo: 'anual',
          dados,
        });
        const [sub] = [...falso.assinaturas.values()];
        const [fim] =
          await sql`select ((trial_ate at time zone fuso)::date)::text as d from public.empresas
          where id = ${e.empresaId}`;
        expect(sub).toMatchObject({ nextDueDate: fim!.d, cycle: 'YEARLY', value: 1470 });
        expect(await situacao(e.empresaId)).toBe('trial');
      },
      { trialDias: 6 },
    );
  });
});

describe('mudar de plano, cancelar, reconciliar', () => {
  it('mudar para o Essencial tira o cupom; cancelar mantém o acesso pago; reconciliação acha pagamento sem webhook', async () => {
    await comEmpresa(async (e) => {
      const { falso, deps } = preparar();
      const r = await assinar(deps, {
        empresaId: e.empresaId,
        usuarioId: e.donoId,
        plano: 'profissional',
        ciclo: 'mensal',
        cupom: 'FUNDADOR',
        dados,
      });
      const pid = r.ok ? r.dados.urlFatura!.split('/').pop()! : '';
      // pagou, mas o webhook se perdeu: a reconciliação encontra
      falso.pagar(pid);
      const resumo = await reconciliar(deps);
      expect(resumo.falhas).toBe(0);
      expect(resumo.cobrancas).toBeGreaterThanOrEqual(2); // a paga e a do próximo mês
      expect(await situacao(e.empresaId)).toBe('ativo');

      expect(
        await mudarPlano(deps, {
          empresaId: e.empresaId,
          usuarioId: e.donoId,
          plano: 'essencial',
          ciclo: 'mensal',
        }),
      ).toEqual({ ok: true });
      const [sub] = [...falso.assinaturas.values()];
      expect(sub!.value).toBe(147);
      const [a] =
        await sql`select plano_codigo, valor_centavos, cupom_codigo from public.assinaturas
        where empresa_id = ${e.empresaId} and status <> 'cancelada'`;
      expect(a).toEqual({ plano_codigo: 'essencial', valor_centavos: 14700, cupom_codigo: null });
      // fatura pendente do próximo ciclo foi atualizada no Asaas
      const pendente = [...falso.pagamentos.values()].find((p) => p.status === 'PENDING');
      expect(pendente!.value).toBe(147);
      expect(
        await mudarPlano(deps, {
          empresaId: e.empresaId,
          usuarioId: e.donoId,
          plano: 'essencial',
          ciclo: 'mensal',
        }),
      ).toMatchObject({ ok: false, erro: 'Você já está neste plano.' });

      expect(
        await cancelarAssinatura(deps, {
          empresaId: e.empresaId,
          usuarioId: e.donoId,
          motivo: 'preco',
          texto: 'caro',
        }),
      ).toEqual({ ok: true });
      expect(sub!.deleted).toBe(true);
      expect(await situacao(e.empresaId)).toBe('cancelado');
      const [c] = await sql`select cancelamento_motivo, cancelamento_texto from public.assinaturas
        where empresa_id = ${e.empresaId}`;
      expect(c).toEqual({ cancelamento_motivo: 'preco', cancelamento_texto: 'caro' });
    });
  });

  it('cupom vencido volta ao preço cheio na reconciliação', async () => {
    await comEmpresa(async (e) => {
      const { falso, deps } = preparar();
      await assinar(deps, {
        empresaId: e.empresaId,
        usuarioId: e.donoId,
        plano: 'profissional',
        ciclo: 'mensal',
        cupom: 'FUNDADOR',
        dados,
      });
      await sql`update public.assinaturas set cupom_ate = current_date - 30 where empresa_id = ${e.empresaId}`;
      const resumo = await reconciliar(deps);
      expect(resumo.cuponsEncerrados).toBe(1);
      expect([...falso.assinaturas.values()][0]!.value).toBe(247);
      const [a] =
        await sql`select valor_centavos from public.assinaturas where empresa_id = ${e.empresaId}`;
      expect(a!.valor_centavos).toBe(24700);
    });
  });
});

describe('/interno: implantação e cupom', () => {
  it('implantação exige dados de cobrança; cria cobrança avulsa de R$ 497', async () => {
    await comEmpresa(async (e) => {
      const { falso, deps } = preparar();
      expect(
        await criarImplantacao(deps, { empresaId: e.empresaId, admin: 'adm@orkestra.app' }),
      ).toEqual({
        ok: false,
        erro: 'A empresa ainda não preencheu os dados de cobrança.',
      });
      await sql`insert into public.empresas_cobranca (empresa_id, nome, documento, email)
        values (${e.empresaId}, 'Dona', '52998224725', 'd@x.com')`;
      const r = await criarImplantacao(deps, { empresaId: e.empresaId, admin: 'adm@orkestra.app' });
      expect(r).toMatchObject({ ok: true });
      const [p] = [...falso.pagamentos.values()];
      expect(p).toMatchObject({ value: 497, subscription: null });
      const [c] =
        await sql`select tipo, valor_centavos, status from public.cobrancas where empresa_id = ${e.empresaId}`;
      expect(c).toEqual({ tipo: 'implantacao', valor_centavos: 49700, status: 'pendente' });
      expect(
        await sql`select acao from public.auditoria_interna where empresa_id = ${e.empresaId}`,
      ).toEqual([{ acao: 'implantacao.criada' }]);
      // paga e a reconciliação confere a avulsa
      falso.pagar(p!.id);
      await reconciliar(deps);
      const [c2] = await sql`select status from public.cobrancas where empresa_id = ${e.empresaId}`;
      expect(c2!.status).toBe('recebida');
    });
  });

  it('aplicar cupom numa assinatura existente', async () => {
    await comEmpresa(async (e) => {
      const { falso, deps } = preparar();
      await assinar(deps, {
        empresaId: e.empresaId,
        usuarioId: e.donoId,
        plano: 'profissional',
        ciclo: 'mensal',
        dados,
      });
      expect(
        await aplicarCupom(deps, { empresaId: e.empresaId, codigo: 'NAOEXISTE', admin: 'a@o.app' }),
      ).toMatchObject({
        ok: false,
      });
      expect(
        await aplicarCupom(deps, { empresaId: e.empresaId, codigo: 'FUNDADOR', admin: 'a@o.app' }),
      ).toEqual({ ok: true });
      expect([...falso.assinaturas.values()][0]!.value).toBe(97);
      const [a] =
        await sql`select valor_centavos, cupom_codigo from public.assinaturas where empresa_id = ${e.empresaId}`;
      expect(a).toEqual({ valor_centavos: 9700, cupom_codigo: 'FUNDADOR' });
    });
  });
});

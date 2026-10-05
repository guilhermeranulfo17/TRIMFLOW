import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmailMontado } from '@/domain/email/modelos';
import type { StorageAdmin } from '@/server/auth/admin-supabase';
import { conectar, IDS, urlBancoTeste } from '../support/db';

/*
 * Etapa 10 (PR 1) pelo servidor: o dono envia a partir do orçamento aceito (texto montado no
 * servidor, hash no banco), o cliente pede o código (e-mail falso), erra, acerta e assina; o
 * CPF fica cifrado (só abre com a chave e o hash do contrato) e o PDF é guardado uma vez.
 */

process.env.DATABASE_URL ??= urlBancoTeste();
const sql = conectar();
const criados: string[] = [];
let leadId: string;
let orcamentoId: string;
let emailAntes: string | null;

beforeAll(async () => {
  process.env.DATABASE_URL = urlBancoTeste();
  const [o] = await sql`select o.id, o.lead_id, l.email from public.orcamentos o
    join public.leads l on l.id = o.lead_id
    where o.empresa_id = ${IDS.empresaA} and o.status = 'aceito' and not l.eh_teste
      and l.anonimizado_em is null
    order by o.criado_em limit 1`;
  orcamentoId = o!.id;
  leadId = o!.lead_id;
  emailAntes = o!.email;
  await sql`update public.leads set email = 'servidor@exemplo.com' where id = ${leadId}`;
});

afterAll(async () => {
  if (criados.length) {
    await sql`delete from public.auditoria where entidade_id in ${sql(criados)}`;
    await sql`delete from public.contratos where id in ${sql(criados)}`;
  }
  await sql`update public.leads set email = ${emailAntes} where id = ${leadId}`;
  await sql`delete from publico.tentativas where acao like 'contrato%'`;
  await sql.end();
});

async function dono() {
  const { lerUsuario } = await import('@/server/auth/sessao');
  return { ...(await lerUsuario(IDS.donoA))!, suporte: null };
}

async function emitir(exigeCodigo: boolean) {
  const { comUsuario } = await import('@/server/db/tenant');
  const { emitirContrato, emissaoSchema } = await import('@/server/contratos/emitir');
  const u = await dono();
  const entrada = emissaoSchema.parse({
    orcamentoId,
    exigeCodigo,
    // o seed não tem tudo (duração, pacote…): o dono completa o que falta
    preencher: Object.fromEntries(
      [
        'horario',
        'duracao',
        'pacote',
        'nao_incluso',
        'hora_extra',
        'convidados_extras',
        'buffet_cnpj',
        'buffet_endereco',
        'buffet_razao_social',
        'buffet_cidade',
        'buffet_whatsapp',
        'tipo_evento',
        'espaco',
        'cliente_whatsapp',
        'forma_pagamento',
        'prazo_saldo',
      ].map((n) => [n, 'Completado na prévia']),
    ),
  });
  const r = await comUsuario(u.id, (tx) =>
    emitirContrato(u, entrada, tx, { ipHash: 'a'.repeat(64), userAgent: 'Vitest' }),
  );
  if (!r.ok) throw new Error(`não emitiu: ${JSON.stringify(r)}`);
  criados.push(r.id);
  return r;
}

describe('cifra do CPF', () => {
  it('abre só com a mesma chave e o mesmo hash do contrato', async () => {
    const { cifrarCpf, decifrarCpf } = await import('@/server/contratos/segredos');
    const h = 'b'.repeat(64);
    const c = cifrarCpf('52998224725', h);
    expect(c).toMatch(/^v1:[A-Za-z0-9_-]+$/);
    expect(c).not.toContain('52998224725');
    expect(cifrarCpf('52998224725', h)).not.toBe(c); // iv aleatório
    expect(decifrarCpf(c, h)).toBe('52998224725');
    expect(decifrarCpf(c, 'c'.repeat(64))).toBeNull();
    expect(decifrarCpf(`${c.slice(0, -2)}AA`, h)).toBeNull();
  });
});

describe('fluxo pelo servidor', () => {
  it('envia, pede o código, erra, acerta, assina e guarda o PDF uma vez', async () => {
    const r = await emitir(true);
    expect(r.codigo).toMatch(/^\d{4}-\d{4}$/);
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const [linha] = await sql`select texto, hash, token_hash, exige_codigo, valores
      from public.contratos where id = ${r.id}`;
    const { hashTexto } = await import('@/domain/contratos/integridade');
    expect(linha!.hash).toBe(hashTexto(linha!.texto));
    expect(linha!.texto).not.toMatch(/\{\{|\[\[FALTA/);
    expect(linha!.exige_codigo).toBe(true);
    expect(linha!.token_hash).not.toBe(r.token);

    const { pedirCodigo, assinar } = await import('@/server/contratos/assinatura');
    const enviados: { para: string; email: EmailMontado; chave: string }[] = [];
    const deps = {
      ipHash: 'd'.repeat(64),
      userAgent: 'Celular',
      modoTeste: false,
      enviarEmail: async (para: string, email: EmailMontado, chave: string) => {
        enviados.push({ para, email, chave });
        return { ok: true as const };
      },
    };

    expect(await pedirCodigo('buffet-demo', r.token, { ...deps, modoTeste: true })).toMatchObject({
      ok: false,
      erro: expect.stringMatching(/modo teste/),
    });
    const pedido = await pedirCodigo('buffet-demo', r.token, deps);
    expect(pedido).toEqual({ ok: true, dados: { email: 's***@exemplo.com' } });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.para).toBe('servidor@exemplo.com');
    const codigo = /^(\d{6})/.exec(enviados[0]!.email.assunto)![1]!;
    expect(enviados[0]!.email.texto).toContain(codigo);
    expect(enviados[0]!.email.html).not.toMatch(/—/);

    const { carregarContratoPublico } = await import('@/server/contratos/carregar');
    const aberto = await carregarContratoPublico('buffet-demo', r.token);
    expect(aberto.estado).toBe('aberto');
    const hash = aberto.estado === 'aberto' ? aberto.hash : '';

    const base = { nome: 'Cliente Do Servidor', cpf: '529.982.247-25', aceite: true, hash };
    expect(
      await assinar('buffet-demo', r.token, { ...base, cpf: '111.111.111-11' }, deps),
    ).toMatchObject({
      ok: false,
      campos: { cpf: expect.any(String) },
    });
    expect(await assinar('buffet-demo', r.token, { ...base, aceite: false }, deps)).toMatchObject({
      ok: false,
      campos: { aceite: expect.any(String) },
    });
    const errado = codigo === '000000' ? '111111' : '000000';
    expect(await assinar('buffet-demo', r.token, { ...base, codigo: errado }, deps)).toMatchObject({
      ok: false,
      erro: 'Código incorreto. Você ainda tem 4 tentativas.',
    });
    expect(await assinar('buffet-demo', r.token, { ...base, codigo }, deps)).toEqual({ ok: true });

    // CPF: cifrado no banco, abre com a chave e o hash do contrato
    const [a] = await sql`select documento_cifrado, documento_mascarado, metodo
      from public.contrato_assinaturas where contrato_id = ${r.id} and parte = 'cliente'`;
    expect(a!.documento_mascarado).toBe('***.982.247-**');
    expect(a!.metodo).toBe('aceite_com_codigo');
    const { decifrarCpf } = await import('@/server/contratos/segredos');
    expect(decifrarCpf(a!.documento_cifrado, hash)).toBe('52998224725');

    // PDF: gerado e guardado na primeira vez; depois vem do Storage
    const { carregarComprovantePublico } = await import('@/server/contratos/carregar');
    const { obterPdfContrato } = await import('@/server/contratos/arquivo');
    const guardados = new Map<string, Uint8Array>();
    const storage: StorageAdmin = {
      listar: async () => [],
      remover: async () => {},
      enviar: async (_b, caminho, bytes) => void guardados.set(caminho, bytes),
      baixar: async (_b, caminho) => guardados.get(caminho) ?? null,
    };
    const { comAnon } = await import('@/server/db/anon');
    const { sql: q } = await import('drizzle-orm');
    const marcar = () =>
      comAnon((tx) =>
        tx.execute(q`select publico.contrato_marcar_pdf('buffet-demo', ${r.token})`),
      ).then(() => undefined);
    const buffet = { nome: 'Buffet Demo', logoUrl: null, corMarca: null };
    let gerados = 0;
    const { gerarPdfContrato } = await import('@/server/contratos/pdf');
    const gerar: typeof gerarPdfContrato = (...args) => {
      gerados++;
      return gerarPdfContrato(...args);
    };
    const c1 = await carregarComprovantePublico('buffet-demo', r.token, 'e'.repeat(64));
    if (!c1 || c1 === 'limite') throw new Error('sem comprovante');
    const pdf1 = await obterPdfContrato(c1, buffet, { storage, marcar, gerar });
    expect(Buffer.from(pdf1.subarray(0, 5)).toString()).toBe('%PDF-');
    expect(guardados.get(`${IDS.empresaA}/${r.id}.pdf`)).toBeDefined();
    const c2 = await carregarComprovantePublico('buffet-demo', r.token, 'e'.repeat(64));
    if (!c2 || c2 === 'limite') throw new Error('sem comprovante');
    expect(c2.pdfGeradoEm).not.toBeNull();
    await obterPdfContrato(c2, buffet, { storage, marcar, gerar });
    expect(gerados).toBe(1);
  });

  it('assinar no modo teste (alguém do buffet) não grava nada', async () => {
    const r = await emitir(false);
    const { assinar } = await import('@/server/contratos/assinatura');
    const { carregarContratoPublico } = await import('@/server/contratos/carregar');
    const c = await carregarContratoPublico('buffet-demo', r.token);
    const hash = c.estado === 'aberto' ? c.hash : '';
    const res = await assinar(
      'buffet-demo',
      r.token,
      { nome: 'Dona Demo', cpf: '529.982.247-25', aceite: true, hash },
      { ipHash: 'f'.repeat(64), modoTeste: true },
    );
    expect(res).toMatchObject({ ok: false, erro: expect.stringMatching(/modo teste/) });
    const [s] = await sql`select status from public.contratos where id = ${r.id}`;
    expect(s!.status).toBe('enviado');
  });
});

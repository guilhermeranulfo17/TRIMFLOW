import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarCanalEmail, URL_RESEND } from '@/server/avisos/canais/email';
import type { Canal } from '@/server/avisos/canais/tipos';
import { assumirUsuario, conectar, urlBancoTeste } from '../support/db';
import {
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';

/*
 * Etapa 9B · B.4: e-mail como canal da fila. Avisos da conta geram a entrega 'email' para o dono,
 * avisos de lead nunca; o mesmo aviso nunca sai duas vezes; sem a chave do Resend, nada quebra.
 */

process.env.DATABASE_URL ??= urlBancoTeste();
const sql = conectar();
let e: EmpresaTemporaria;

beforeAll(async () => {
  process.env.DATABASE_URL = urlBancoTeste();
  e = await criarEmpresaTemporaria(sql, 'infantil');
});
afterAll(async () => {
  await sql`delete from public.avisos where empresa_id = ${e.empresaId}`;
  await sql`delete from public.auditoria where empresa_id = ${e.empresaId}`;
  await removerEmpresa(sql, e);
  await sql.end();
});

/** Roda uma função do painel como o usuário (claims do JWT), numa transação confirmada. */
async function como<T>(usuario: string, consulta: string): Promise<T> {
  return sql.begin(async (tx) => {
    await assumirUsuario(tx, usuario);
    const [r] = await tx.unsafe(consulta);
    return r as T;
  }) as Promise<T>;
}

const entregasEmail = () =>
  sql`select a.tipo::text as tipo, en.status::text as status, en.erro_codigo
      from public.avisos_entregas en join public.avisos a on a.id = en.aviso_id
      where en.empresa_id = ${e.empresaId} and en.canal = 'email' order by a.criado_em`;

function fetchFalso() {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    return new Response('{"id":"x"}', { status: 200 });
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

const desligado = (nome: Canal['nome']): Canal => ({
  nome,
  configurado: () => false,
  enviar: async () => ({ resultado: 'ignorado', erro: 'CANAL_DESLIGADO' }),
});

describe('canal de e-mail na fila', () => {
  it('boas-vindas: uma vez por empresa, só para o dono, com entrega de e-mail', async () => {
    const a = await como<{ id: string }>(e.donoId, 'select public.avisar_boas_vindas() as id');
    const b = await como<{ id: string | null }>(
      e.donoId,
      'select public.avisar_boas_vindas() as id',
    );
    const v = await como<{ id: string | null }>(
      e.vendedorId,
      'select public.avisar_boas_vindas() as id',
    );
    expect(a.id).toBeTruthy();
    expect(b.id).toBeNull();
    expect(v.id).toBeNull();
    const [aviso] = await sql`select dados from public.avisos where id = ${a.id}`;
    expect(aviso!.dados).toMatchObject({ slug: expect.stringMatching(/^buffet-temp-/) });
    expect(await entregasEmail()).toEqual([
      { tipo: 'boas_vindas', status: 'pendente', erro_codigo: null },
    ]);
  });

  it('aviso de lead nunca vira e-mail; de cobrança vira (inclusive com a conta suspensa)', async () => {
    await sql`select public._aviso_criar(${e.empresaId}, ${e.donoId}, 'visita_pedida', null,
      '{}'::jsonb, ${'email-lead:' + e.empresaId}, false)`;
    await sql`select public._aviso_criar(${e.empresaId}, ${e.vendedorId}, 'fatura_criada', null,
      '{}'::jsonb, ${'email-vendedor:' + e.empresaId}, false)`;
    await sql`update public.empresas set suspensa_manual_em = now() where id = ${e.empresaId}`;
    await sql`select public._atualizar_situacao(${e.empresaId})`;
    await sql`select public._aviso_donos(${e.empresaId}, 'pagamento_falhou',
      '{"valor_centavos": 9900}'::jsonb, ${'email-falhou:' + e.empresaId})`;
    // a conta suspensa ainda exporta os dados e recebe o aviso de segurança
    await como(e.donoId, 'select public.lgpd_registrar_exportacao()');
    await sql`update public.empresas set suspensa_manual_em = null where id = ${e.empresaId}`;
    await sql`select public._atualizar_situacao(${e.empresaId})`;

    const tipos = (await entregasEmail()).map((r) => r.tipo);
    // a própria suspensão avisa o dono (conta_suspensa)
    expect(tipos).toEqual([
      'boas_vindas',
      'conta_suspensa',
      'pagamento_falhou',
      'exportacao_pronta',
    ]);
  });

  it('sem RESEND_API_KEY: entrega ignorada com código, nada lança', async () => {
    const { processarAvisos } = await import('@/server/avisos/processar');
    // os avisos da conta respeitam o silêncio do dono (22:00 às 07:00): à noite nascem para as 07:00
    await sql`update public.avisos_entregas set proximo_envio_em = now()
      where empresa_id = ${e.empresaId} and status = 'pendente'`;
    await processarAvisos({
      canais: [
        desligado('push'),
        desligado('whatsapp'),
        criarCanalEmail(null, { site: 'https://x.test' }),
      ],
      limite: 200,
    });
    const rs = await entregasEmail();
    expect(rs.every((r) => r.status === 'ignorado' && r.erro_codigo === 'CANAL_DESLIGADO')).toBe(
      true,
    );
  });

  it('envia pelo Resend com Idempotency-Key = entrega e nunca repete', async () => {
    const { processarAvisos } = await import('@/server/avisos/processar');
    const [nova] =
      await sql`select public._aviso_criar(${e.empresaId}, ${e.donoId}, 'conta_suspensa',
      null, '{}'::jsonb, ${'email-envio:' + e.empresaId}, false) as id`;
    const [entrega] = await sql`select id from public.avisos_entregas
      where aviso_id = ${nova!.id} and canal = 'email'`;
    const { f, chamadas } = fetchFalso();
    const canal = criarCanalEmail(
      { chave: 're_teste', remetente: 'Orkestra <avisos@orkestra.test>' },
      { site: 'https://app.orkestra.test', fetch: f },
    );
    const canais = [desligado('push'), desligado('whatsapp'), canal];
    await processarAvisos({ canais, limite: 200 });
    await processarAvisos({ canais, limite: 200 });

    expect(chamadas).toHaveLength(1);
    const c = chamadas[0]!;
    expect(c.url).toBe(URL_RESEND);
    const h = c.init.headers as Record<string, string>;
    expect(h['Idempotency-Key']).toBe(entrega!.id);
    expect(h.Authorization).toBe('Bearer re_teste');
    const corpo = JSON.parse(String(c.init.body));
    const [dono] = await sql`select email from public.usuarios where id = ${e.donoId}`;
    expect(corpo.to).toEqual([dono!.email]);
    expect(corpo.subject).toMatch(/suspensa/i);
    expect(corpo.html).toContain('https://app.orkestra.test/app/empresa/plano');
    const [st] =
      await sql`select status::text from public.avisos_entregas where id = ${entrega!.id}`;
    expect(st!.status).toBe('enviado');
  });

  it('Resend fora do ar: tenta de novo depois; 4xx definitivo é ignorado', async () => {
    const respostas = [503, 422];
    const f = (async () =>
      new Response('{}', { status: respostas.shift() ?? 200 })) as unknown as typeof fetch;
    const canal = criarCanalEmail(
      { chave: 'k', remetente: 'r@x.test' },
      { site: 'https://x.test', fetch: f },
    );
    const base = {
      entregaId: '00000000-0000-0000-0000-000000000001',
      canal: 'email' as const,
      tentativas: 1,
      aviso: { id: 'a', tipo: 'conta_suspensa' as const, dados: {}, leadId: null, agrupados: 0 },
      fuso: 'America/Sao_Paulo',
      whatsappNumero: null,
      inscricoes: [],
      email: 'dono@x.test',
    };
    expect(await canal.enviar(base)).toEqual({ resultado: 'erro', erro: 'EMAIL_503' });
    expect(await canal.enviar(base)).toEqual({ resultado: 'ignorado', erro: 'EMAIL_422' });
    expect(await canal.enviar({ ...base, email: null })).toEqual({
      resultado: 'ignorado',
      erro: 'SEM_EMAIL',
    });
  });
});

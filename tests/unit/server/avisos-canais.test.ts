import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarCanalPush } from '@/server/avisos/canais/push';
import type { EntregaParaEnviar } from '@/server/avisos/canais/tipos';
import { criarCanalWhatsapp } from '@/server/avisos/canais/whatsapp';

vi.mock('@/server/avisos/processar', () => ({
  processarAvisos: vi.fn(async () => ({ processadas: 0, enviadas: 0, erros: 0, ignoradas: 0 })),
}));

const VAPID = { publica: 'pub', privada: 'priv', sujeito: 'mailto:a@b.c' };

const entrega = (p: Partial<EntregaParaEnviar> = {}): EntregaParaEnviar => ({
  entregaId: 'e1',
  canal: 'push',
  tentativas: 1,
  aviso: {
    id: 'a1',
    tipo: 'pre_reserva_pedida',
    dados: {
      lead_nome: 'Ana Souza',
      data: '2026-11-14',
      turno: 'Tarde',
      convidados: 80,
      total_centavos: 703237,
    },
    leadId: 'lead-1',
    agrupados: 1,
  },
  fuso: 'America/Sao_Paulo',
  whatsappNumero: '+5534991355450',
  inscricoes: [
    { endpoint: 'https://push.test/1', p256dh: 'p'.repeat(20), auth: 'a'.repeat(10) },
    { endpoint: 'https://push.test/2', p256dh: 'p'.repeat(20), auth: 'a'.repeat(10) },
  ],
  ...p,
});

const erroHttp = (statusCode: number) => Object.assign(new Error('http'), { statusCode });

describe('canal push', () => {
  it('sem VAPID: desligado (ignorado)', async () => {
    const r = await criarCanalPush(null, vi.fn()).enviar(entrega());
    expect(r).toEqual({ resultado: 'ignorado', erro: 'CANAL_DESLIGADO' });
  });
  it('um aparelho recebe e o outro responde 410: enviado e o morto vai para apagar', async () => {
    const enviar = vi.fn(async (i: { endpoint: string }, _payload: string) => {
      if (i.endpoint.endsWith('/2')) throw erroHttp(410);
    });
    const r = await criarCanalPush(VAPID, enviar).enviar(entrega());
    expect(r).toEqual({ resultado: 'enviado', endpointsInvalidos: ['https://push.test/2'] });
    const payload = JSON.parse(enviar.mock.calls[0]![1]);
    expect(payload).toMatchObject({
      titulo: 'Pré-reserva: Ana Souza',
      url: '/app/leads/lead-1',
      tag: 'a1',
    });
  });
  it('todos 404/410: ignorado, apaga as inscrições', async () => {
    const r = await criarCanalPush(
      VAPID,
      vi.fn(async () => Promise.reject(erroHttp(404))),
    ).enviar(entrega());
    expect(r).toEqual({
      resultado: 'ignorado',
      erro: 'SEM_INSCRICAO',
      endpointsInvalidos: ['https://push.test/1', 'https://push.test/2'],
    });
  });
  it('erro do serviço de push: erro com código (tenta de novo depois)', async () => {
    const r = await criarCanalPush(
      VAPID,
      vi.fn(async () => Promise.reject(erroHttp(500))),
    ).enviar(entrega());
    expect(r).toMatchObject({ resultado: 'erro', erro: 'PUSH_500' });
  });
  it('sem aparelho: ignorado', async () => {
    const r = await criarCanalPush(VAPID, vi.fn()).enviar(entrega({ inscricoes: [] }));
    expect(r).toEqual({ resultado: 'ignorado', erro: 'SEM_INSCRICAO' });
  });
});

describe('canal WhatsApp (Meta Cloud API)', () => {
  const config = { token: 'TOKEN', phoneNumberId: '123' };
  it('sem configuração: desligado', async () => {
    const r = await criarCanalWhatsapp(null).enviar(entrega({ canal: 'whatsapp' }));
    expect(r).toEqual({ resultado: 'ignorado', erro: 'CANAL_DESLIGADO' });
  });
  it('envia o modelo com as variáveis e o botão para o lead', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    const r = await criarCanalWhatsapp(config, { fetch }).enviar(entrega({ canal: 'whatsapp' }));
    expect(r).toEqual({ resultado: 'enviado' });
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/123/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
    const corpo = JSON.parse(init.body as string);
    expect(corpo).toMatchObject({
      to: '5534991355450',
      type: 'template',
      template: { name: 'orkestra_pre_reserva', language: { code: 'pt_BR' } },
    });
    expect(corpo.template.components[0].parameters[0]).toEqual({ type: 'text', text: 'Ana Souza' });
    expect(corpo.template.components[1]).toMatchObject({
      type: 'button',
      parameters: [{ type: 'text', text: 'leads/lead-1' }],
    });
  });
  it('Meta recusa (modelo não aprovado): erro com o código, sem travar', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 132001, message: 'x' } }), { status: 400 }),
    );
    const r = await criarCanalWhatsapp(config, { fetch }).enviar(entrega({ canal: 'whatsapp' }));
    expect(r).toEqual({ resultado: 'erro', erro: 'META_132001' });
  });
  it('tipo sem modelo ou sem número: ignorado', async () => {
    const canal = criarCanalWhatsapp(config, { fetch: vi.fn() });
    expect(
      await canal.enviar(
        entrega({ canal: 'whatsapp', aviso: { ...entrega().aviso, tipo: 'cliente_parou' } }),
      ),
    ).toEqual({ resultado: 'ignorado', erro: 'SEM_MODELO' });
    expect(await canal.enviar(entrega({ canal: 'whatsapp', whatsappNumero: null }))).toEqual({
      resultado: 'ignorado',
      erro: 'SEM_NUMERO',
    });
  });
});

describe('rota /api/avisos/processar', () => {
  afterEach(() => vi.unstubAllEnvs());
  const chamar = async (auth?: string) => {
    const { POST } = await import('@/app/api/avisos/processar/route');
    const { NextRequest } = await import('next/server');
    return POST(
      new NextRequest('http://localhost/api/avisos/processar', {
        method: 'POST',
        headers: auth ? { authorization: auth } : {},
      }),
    );
  };
  it('recusa sem o segredo, com o segredo errado e quando o servidor não tem segredo', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-certo');
    expect((await chamar()).status).toBe(401);
    expect((await chamar('Bearer outro')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await chamar('Bearer ')).status).toBe(401);
  });
  it('aceita com o segredo certo', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-certo');
    const r = await chamar('Bearer segredo-certo');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, processadas: 0 });
  });
});

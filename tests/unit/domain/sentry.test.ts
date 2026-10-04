import { describe, expect, it } from 'vitest';
import { limparEvento, limparUrl } from '@/domain/observabilidade/sentry';

const EVENTO = {
  event_id: 'abc',
  message: 'Falha ao enviar para maria@exemplo.com',
  user: { id: 'u1', email: 'dono@buffet.com', ip_address: '200.1.2.3', username: 'Dona' },
  server_name: 'vercel-1',
  request: {
    method: 'POST',
    url: 'https://orkestra.app/b/buffet-x/proposta/TOKENSECRETO123?origem=whatsapp',
    cookies: { 'sb-access-token': 'jwt' },
    headers: { cookie: 'x', authorization: 'Bearer y', 'x-forwarded-for': '200.1.2.3' },
    data: { nome: 'Maria Silva', whatsapp: '+5534991113304' },
    query_string: 'telefone=34991113304',
  },
  transaction: '/b/buffet-x/proposta/TOKENSECRETO123',
  exception: { values: [{ type: 'Error', value: 'lead (34) 99111-3304 sem orçamento' }] },
  extra: {
    lead: { nome: 'Maria', whatsapp_e164: '+5534991113304' },
    cliente_nome: 'Maria Silva',
    empresa_id: '11111111-1111-4111-8111-111111111111',
    detalhes: { email: 'a@b.com', passo: 3, texto: 'Maria pediu desconto' },
  },
  contexts: { usuario: { nome: 'Dona' }, runtime: { name: 'node' } },
  tags: { telefone: '34991113304', rota: '/app/leads' },
  breadcrumbs: [
    {
      category: 'fetch',
      message: 'GET /api/x falhou para joao@x.com',
      data: { url: 'https://orkestra.app/b/x/proposta/TOK?a=1', nome: 'João' },
    },
  ],
};

describe('limparEvento (beforeSend do Sentry)', () => {
  const limpo = limparEvento(structuredClone(EVENTO)) as Record<string, unknown>;
  const texto = JSON.stringify(limpo);

  it('nenhum nome, telefone, e-mail, IP, cookie ou token sobra no evento', () => {
    for (const proibido of [
      'Maria',
      'João',
      'Dona',
      '991113304',
      '99111-3304',
      '@exemplo.com',
      'dono@buffet.com',
      'joao@x.com',
      '200.1.2.3',
      'TOKENSECRETO123',
      'TOK?',
      'jwt',
      'Bearer',
      'sb-access-token',
    ]) {
      expect(texto, proibido).not.toContain(proibido);
    }
  });

  it('o que ajuda a depurar fica: ids, rota, tipo do erro, método e caminho', () => {
    expect(limpo.user).toBeUndefined();
    expect(limpo.request).toEqual({
      method: 'POST',
      url: 'https://orkestra.app/b/buffet-x/proposta/[token]',
    });
    expect(limpo.transaction).toBe('/b/buffet-x/proposta/[token]');
    expect(texto).toContain('11111111-1111-4111-8111-111111111111');
    expect(texto).toContain('"rota":"/app/leads"');
    expect(texto).toContain('"passo":3');
    expect(texto).toContain('"type":"Error"');
    expect(limpo.contexts).toEqual({ runtime: { name: 'node' } });
    expect(limpo.message as string).toBe('Falha ao enviar para [email]');
  });

  it('URL sem query e sem token', () => {
    expect(limparUrl('/b/x/proposta/abc/pdf?x=1#y')).toBe('/b/x/proposta/[token]/pdf');
    expect(limparUrl('/app/leads?busca=maria')).toBe('/app/leads');
  });
});

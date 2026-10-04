import { describe, expect, it } from 'vitest';
import {
  cabecalhosFixos,
  gerarNonce,
  montarCsp,
  origemDoSentry,
  podeSerEmbutida,
  tipoDaRota,
} from '@/domain/seguranca/cabecalhos';

const diretiva = (csp: string, nome: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${nome} `))
    ?.split(' ')
    .slice(1);

describe('CSP', () => {
  it('página dinâmica: script só com o nonce (strict-dynamic), nada de inline nem eval', () => {
    const csp = montarCsp({
      tipo: 'pagina',
      nonce: 'abc',
      supabase: 'https://xyz.supabase.co/',
      sentry: 'https://o1.ingest.sentry.io',
      https: true,
    });
    expect(diretiva(csp, 'script-src')).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(csp).not.toContain('unsafe-eval');
    expect(diretiva(csp, 'connect-src')).toEqual([
      "'self'",
      'https://xyz.supabase.co',
      'wss://xyz.supabase.co',
      'https://o1.ingest.sentry.io',
    ]);
    expect(diretiva(csp, 'img-src')).toContain('https://xyz.supabase.co');
    expect(diretiva(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(diretiva(csp, 'object-src')).toEqual(["'none'"]);
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('estática: inline liberado (sem nonce no cache); desenvolvimento libera eval', () => {
    const csp = montarCsp({ tipo: 'pagina_estatica' });
    expect(diretiva(csp, 'script-src')).toEqual(["'self'", "'unsafe-inline'"]);
    const dev = montarCsp({ tipo: 'pagina', nonce: 'n', desenvolvimento: true });
    expect(diretiva(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(dev).not.toContain('upgrade-insecure-requests');
  });

  it('arquivo e API: não carrega nada; vitrine pode ser embutida só pelo próprio site', () => {
    expect(montarCsp({ tipo: 'arquivo' })).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    expect(
      diretiva(montarCsp({ tipo: 'pagina', nonce: 'n', embutivel: true }), 'frame-ancestors'),
    ).toEqual(["'self'"]);
  });

  it('tipo da rota', () => {
    expect(tipoDaRota('/')).toBe('pagina_estatica');
    expect(tipoDaRota('/termos')).toBe('pagina_estatica');
    expect(tipoDaRota('/app/leads')).toBe('pagina');
    expect(tipoDaRota('/b/buffet-demo')).toBe('pagina');
    expect(tipoDaRota('/api/saude')).toBe('arquivo');
    expect(tipoDaRota('/b/x/proposta/tok/pdf')).toBe('arquivo');
    expect(tipoDaRota('/app/leads/1/exportar')).toBe('arquivo');
    expect(tipoDaRota('/auth/callback')).toBe('arquivo');
    expect(podeSerEmbutida('/b/buffet-demo')).toBe(true);
    expect(podeSerEmbutida('/b/buffet-demo/orcamento')).toBe(false);
    expect(podeSerEmbutida('/app/leads')).toBe(false);
  });

  it('Sentry: origem do DSN; DSN inválido não entra', () => {
    expect(origemDoSentry('https://chave@o123.ingest.us.sentry.io/456')).toBe(
      'https://o123.ingest.us.sentry.io',
    );
    expect(origemDoSentry('lixo')).toBeNull();
    expect(origemDoSentry(undefined)).toBeNull();
  });
});

describe('outros cabeçalhos', () => {
  it('HSTS só em HTTPS; X-Frame-Options acompanha a CSP', () => {
    const h = cabecalhosFixos({ embutivel: false, https: true });
    expect(h['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Permissions-Policy']).toContain('camera=()');
    expect(cabecalhosFixos({ embutivel: true, https: false })).not.toHaveProperty(
      'Strict-Transport-Security',
    );
  });

  it('nonce de 16 bytes em base64, diferente a cada chamada', () => {
    expect(gerarNonce(new Uint8Array(16))).toBe('AAAAAAAAAAAAAAAAAAAAAA==');
    expect(gerarNonce()).not.toBe(gerarNonce());
  });
});

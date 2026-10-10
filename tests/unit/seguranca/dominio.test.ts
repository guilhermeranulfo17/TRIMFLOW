import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOMINIOS_ANTIGOS, redirecionamentoDeDominio } from '@/domain/seguranca/dominio';

/*
 * Etapa 9B · B.6: o domínio antigo redireciona (308, caminho e query) para o de
 * NEXT_PUBLIC_SITE_URL, passando pelo middleware de verdade; e nenhum link absoluto do código usa
 * domínio fixo.
 */

const NOVO = 'https://orkestra.com.br';
const ANTIGO = DOMINIOS_ANTIGOS[0];

describe('redirecionamentoDeDominio', () => {
  const r = (host: string | null, pathname: string, search = '', site: string | null = NOVO) =>
    redirecionamentoDeDominio(host, { pathname, search }, site);

  it('antigo → novo com caminho e query', () => {
    expect(r(ANTIGO, '/b/buffet-alegria', '?utm_source=instagram&x=1')).toBe(
      `${NOVO}/b/buffet-alegria?utm_source=instagram&x=1`,
    );
    expect(r(`${ANTIGO.toUpperCase()}:443`, '/')).toBe(`${NOVO}/`);
  });

  it('domínio sem "www" → com "www" (e o com "www" não redireciona)', () => {
    const site = 'https://www.sistemaorkestra.com.br';
    expect(r('sistemaorkestra.com.br', '/b/buffet', '?origem=qrcode', site)).toBe(
      `${site}/b/buffet?origem=qrcode`,
    );
    expect(r('www.sistemaorkestra.com.br', '/b/buffet', '', site)).toBeNull();
  });

  it('não redireciona: domínio novo, outro host, site ainda no antigo, sem site ou API', () => {
    expect(r('orkestra.com.br', '/app')).toBeNull();
    expect(r('preview-123.vercel.app', '/app')).toBeNull();
    expect(r(ANTIGO, '/app', '', `https://${ANTIGO}`)).toBeNull();
    expect(r(ANTIGO, '/app', '', null)).toBeNull();
    expect(r(ANTIGO, '/app', '', 'não é url')).toBeNull();
    expect(r(ANTIGO, '/api/cobranca/asaas')).toBeNull();
    expect(r(null, '/')).toBeNull();
  });
});

describe('middleware', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('responde 308 no domínio antigo, preservando caminho e query', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', NOVO);
    const { middleware } = await import('@/middleware');
    const req = new NextRequest(`https://${ANTIGO}/b/buffet-alegria/orcamento?origem=qrcode`, {
      headers: { host: ANTIGO },
    });
    const res = await middleware(req);
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${NOVO}/b/buffet-alegria/orcamento?origem=qrcode`);
  });

  it('no domínio novo segue normal (cabeçalhos de segurança, sem redirecionar)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', NOVO);
    const { middleware } = await import('@/middleware');
    const req = new NextRequest(`${NOVO}/termos`, { headers: { host: 'orkestra.com.br' } });
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('content-security-policy')).toBeTruthy();
  });
});

describe('links absolutos só de NEXT_PUBLIC_SITE_URL', () => {
  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }

  it('nenhum domínio do Orkestra fixo no código (fora da lista de antigos)', () => {
    const achados = arquivos('src')
      .filter((p) => !p.endsWith(join('domain', 'seguranca', 'dominio.ts')))
      .filter((p) => /trimflow|vercel\.app|orkestra\.(com|app)/i.test(readFileSync(p, 'utf8')));
    expect(achados).toEqual([]);
  });

  it('nada monta link com o host da requisição nem com URL vazia', () => {
    // env.ts é a fonte (siteUrl); o resto só chama siteUrl()
    const achados = arquivos('src').filter(
      (p) =>
        !p.endsWith(join('server', 'env.ts')) &&
        /urlDoSite\(\) \?\?|get\('x-forwarded-host'\)|new URL\(req(uest)?\.url\)\.origin/.test(
          readFileSync(p, 'utf8'),
        ),
    );
    expect(achados).toEqual([]);
  });
});

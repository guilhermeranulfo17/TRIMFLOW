import { describe, expect, it } from 'vitest';
import {
  algumPixel,
  idGa4,
  idPixelMeta,
  idsDosPixels,
  lerConsentimento,
  lerConversao,
  origensDosPixels,
  rotaComPixels,
} from '@/domain/marketing/pixels';
import { montarCsp } from '@/domain/seguranca/cabecalhos';

/* Pixels da landing (§98): desligados sem id, e só nas páginas de venda. */

describe('ids dos pixels', () => {
  it('GA4 e Meta no formato certo; o resto vira null (desligado)', () => {
    expect(idGa4(' g-abc123XYZ ')).toBe('G-ABC123XYZ');
    expect(idGa4('UA-1234-1')).toBeNull();
    expect(idGa4('')).toBeNull();
    expect(idPixelMeta('123456789012345')).toBe('123456789012345');
    expect(idPixelMeta('abc')).toBeNull();
    expect(idsDosPixels({})).toEqual({ ga4: null, metaPixel: null });
    expect(algumPixel(idsDosPixels({}))).toBe(false);
    expect(algumPixel(idsDosPixels({ NEXT_PUBLIC_META_PIXEL_ID: '123456789012' }))).toBe(true);
  });

  it('consentimento e conversão: só os valores conhecidos', () => {
    expect(lerConsentimento('aceito')).toBe('aceito');
    expect(lerConsentimento('recusado')).toBe('recusado');
    expect(lerConsentimento('sim')).toBeNull();
    expect(lerConversao('cadastro')).toBe('cadastro');
    expect(lerConversao('outra')).toBeNull();
  });
});

describe('onde os pixels carregam', () => {
  it('landing, páginas por tipo de buffet, cadastro e a conversão; nunca o painel nem a vitrine', () => {
    for (const r of ['/', '/sistema-para-buffet-infantil', '/cadastro', '/app/comecar']) {
      expect(rotaComPixels(r), r).toBe(true);
    }
    for (const r of ['/app/leads', '/b/buffet-demo', '/login', '/privacidade', '/interno']) {
      expect(rotaComPixels(r), r).toBe(false);
    }
  });

  it('a CSP só libera as origens do pixel ligado', () => {
    const nada = origensDosPixels({ ga4: null, metaPixel: null });
    expect(nada).toEqual({ script: [], connect: [], img: [] });
    const so = origensDosPixels({ ga4: null, metaPixel: '123456789012' });
    expect(so.script).toEqual(['https://connect.facebook.net']);
    expect(so.connect.join(' ')).not.toContain('google');

    const csp = montarCsp({
      tipo: 'pagina_estatica',
      pixels: origensDosPixels({ ga4: 'G-ABC1234', metaPixel: '123456789012' }),
    });
    const diretiva = (n: string) =>
      csp
        .split('; ')
        .find((d) => d.startsWith(`${n} `))
        ?.split(' ') ?? [];
    expect(diretiva('script-src')).toEqual(
      expect.arrayContaining(['https://*.googletagmanager.com', 'https://connect.facebook.net']),
    );
    expect(diretiva('connect-src')).toContain('https://*.google-analytics.com');
    expect(diretiva('img-src')).toContain('https://www.facebook.com');
    // sem pixels, nada de fora
    expect(montarCsp({ tipo: 'pagina_estatica' })).not.toMatch(/google|facebook/);
  });
});

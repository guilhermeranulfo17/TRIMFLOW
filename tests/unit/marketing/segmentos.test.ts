import { describe, expect, it } from 'vitest';
import {
  jsonLdOrganizacao,
  jsonLdSite,
  jsonLdTrilha,
  PAGINAS_SEGMENTO,
  paginaDoSegmento,
  serializarJsonLdLanding,
} from '@/domain/marketing';
import { PAGINAS_ESTATICAS } from '@/domain/seguranca/cabecalhos';

/* Páginas por tipo de buffet (§98): uma por busca, com título e texto próprios. */

describe('páginas por tipo de buffet', () => {
  it('quatro páginas, caminhos e títulos únicos, todas estáticas', () => {
    expect(PAGINAS_SEGMENTO.map((p) => p.chave)).toEqual([
      'infantil',
      'casamento',
      'eventos',
      'domicilio',
    ]);
    const caminhos = PAGINAS_SEGMENTO.map((p) => p.caminho);
    expect(new Set(caminhos).size).toBe(4);
    expect(new Set(PAGINAS_SEGMENTO.map((p) => p.titulo)).size).toBe(4);
    expect(new Set(PAGINAS_SEGMENTO.map((p) => p.descricao)).size).toBe(4);
    for (const c of caminhos) {
      expect(c).toMatch(/^\/sistema-para-[a-z-]+$/);
      expect(PAGINAS_ESTATICAS).toContain(c);
    }
  });

  it('título até 60 e descrição até 160 caracteres (o Google não corta), com a palavra-chave', () => {
    for (const p of PAGINAS_SEGMENTO) {
      expect(p.titulo.length, p.titulo).toBeLessThanOrEqual(60);
      expect(p.descricao.length, p.descricao).toBeLessThanOrEqual(160);
      expect(p.descricao.length).toBeGreaterThanOrEqual(100);
      expect(p.titulo.toLowerCase()).toContain('sistema para buffet');
      expect(p.h1.toLowerCase()).toContain('sistema para buffet');
    }
  });

  it('texto da landing: sem travessão, sem número inventado de clientes, sem nota', () => {
    for (const p of PAGINAS_SEGMENTO) {
      const tudo = JSON.stringify(p);
      expect(tudo).not.toMatch(/[—–]/);
      expect(tudo).not.toMatch(/\d+\s*(clientes|buffets|avalia)/i);
      expect(tudo).not.toMatch(/estrelas|depoimento/i);
      expect(p.recursos.length).toBe(4);
      expect(p.duvidas.length).toBeGreaterThanOrEqual(2);
      expect(p.festas.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('busca pela chave', () => {
    expect(paginaDoSegmento('domicilio').caminho).toBe('/sistema-para-buffet-em-domicilio');
  });
});

describe('JSON-LD do site', () => {
  it('organização, site e trilha', () => {
    expect(jsonLdOrganizacao({ url: 'https://x.com.br', email: 'oi@x.com.br' })).toMatchObject({
      '@type': 'Organization',
      logo: 'https://x.com.br/icones/icone-512.png',
      email: 'oi@x.com.br',
    });
    expect(jsonLdOrganizacao({ url: 'https://x.com.br' })).not.toHaveProperty('email');
    expect(jsonLdSite('https://x.com.br')).toMatchObject({ '@type': 'WebSite', name: 'Orkestra' });
    const trilha = jsonLdTrilha('https://x.com.br', [
      { nome: 'Início', caminho: '/' },
      { nome: 'Buffet infantil', caminho: '/sistema-para-buffet-infantil' },
    ]) as { itemListElement: { position: number; item: string }[] };
    expect(trilha.itemListElement.map((i) => [i.position, i.item])).toEqual([
      [1, 'https://x.com.br'],
      [2, 'https://x.com.br/sistema-para-buffet-infantil'],
    ]);
  });

  it('serializa sem fechar o <script>', () => {
    expect(serializarJsonLdLanding({ a: '</script><b>' })).not.toContain('<');
  });
});

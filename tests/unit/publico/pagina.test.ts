import { describe, expect, it } from 'vitest';
import { contextoDoModelo, MODELOS } from '@/domain/modelos';
import {
  altPadrao,
  diferenciaisValidos,
  estiloEfetivo,
  jsonLdNegocio,
  linkMapa,
  localDaPagina,
  montarVitrine,
  perguntasAutomaticas,
  serializarJsonLd,
  sugestoesDiferenciais,
  sugestoesSlogan,
} from '@/domain/publico';
import {
  depoimentosSchema,
  galeriaSchema,
  perguntasSchema,
  textosPaginaSchema,
} from '@/domain/validacao/pagina';

const vitrine = montarVitrine(contextoDoModelo(MODELOS.infantil), {}, '2026-10-03');

describe('estilo da página', () => {
  it('sem escolha usa o padrão do segmento', () => {
    expect(estiloEfetivo(null, 'infantil')).toBe('festivo');
    expect(estiloEfetivo(null, 'eventos')).toBe('elegante');
    expect(estiloEfetivo(undefined, 'domicilio')).toBe('limpo');
    expect(estiloEfetivo('neon', 'infantil')).toBe('festivo');
  });
  it('a escolha do dono vale sobre o segmento', () => {
    expect(estiloEfetivo('limpo', 'infantil')).toBe('limpo');
  });
});

describe('diferenciais', () => {
  it('aceita até 8, de 2 a 40 caracteres, sem repetir (sem diferenciar maiúsculas)', () => {
    expect(diferenciaisValidos([])).toBe(true);
    expect(diferenciaisValidos(['Monitores', 'Espaço próprio'])).toBe(true);
    expect(diferenciaisValidos(['Monitores', ' monitores '])).toBe(false);
    expect(diferenciaisValidos(['x'])).toBe(false);
    expect(diferenciaisValidos(['x'.repeat(41)])).toBe(false);
    expect(diferenciaisValidos(Array.from({ length: 9 }, (_, i) => `Item ${i}`))).toBe(false);
  });
  it('sugestões do segmento sem as já usadas', () => {
    const s = sugestoesDiferenciais('infantil', ['monitores']);
    expect(s).not.toContain('Monitores');
    expect(s).toContain('Espaço próprio');
    expect(sugestoesSlogan('eventos')).toHaveLength(3);
    for (const seg of ['infantil', 'eventos', 'domicilio'] as const) {
      for (const f of sugestoesSlogan(seg)) expect(f.length).toBeLessThanOrEqual(80);
      expect(diferenciaisValidos(sugestoesDiferenciais(seg))).toBe(true);
    }
  });
});

describe('perguntas automáticas', () => {
  it('saem dos dados reais: duração, convidados, incluso, preço, extras e reserva', () => {
    const p = perguntasAutomaticas(vitrine, { prazoPreReservaHoras: 48 });
    const titulos = p.map((x) => x.pergunta);
    expect(titulos).toEqual([
      'Quanto tempo dura a festa?',
      'Quantos convidados posso ter?',
      'O que está incluso?',
      'Quanto custa?',
      'Posso adicionar itens extras?',
      'Como faço para reservar a data?',
    ]);
    expect(p.at(-1)!.resposta).toMatch(/2 dias/);
    expect(p[3]!.resposta).toMatch(/R\$/);
  });
  it('sem preço público ("após contato") não fala em valor; sem pacote, só a reserva', () => {
    const semPreco = perguntasAutomaticas({
      ...vitrine,
      modoPreco: 'apos_contato',
      aPartirDeCentavos: null,
    });
    expect(semPreco.map((x) => x.pergunta)).not.toContain('Quanto custa?');
    expect(semPreco.some((x) => /R\$/.test(x.resposta))).toBe(false);
    const vazia = perguntasAutomaticas({
      ...vitrine,
      pacotes: [],
      opcionais: [],
      aPartirDeCentavos: null,
    });
    expect(vazia.map((x) => x.pergunta)).toEqual(['Como faço para reservar a data?']);
  });
  it('duração única e convidados sem máximo', () => {
    const um = vitrine.pacotes
      .slice(0, 1)
      .map((p) => ({ ...p, maxConvidados: null, duracaoInclusaMin: 270 }));
    const p = perguntasAutomaticas({ ...vitrine, pacotes: um }, { prazoPreReservaHoras: 36 });
    expect(p[0]!.resposta).toBe('A festa tem 4h30 de duração.');
    expect(p[1]!.resposta).toMatch(/^A partir de \d+ convidados\.$/);
    expect(p.at(-1)!.resposta).toMatch(/36 horas/);
  });
});

describe('onde fica e dados estruturados', () => {
  const base = { endereco: null, bairro: 'Centro', cidade: 'Uberlândia', uf: 'MG' };
  it('endereço completo só quando o dono marca (senão bairro e cidade)', () => {
    expect(localDaPagina(base)).toBe('Centro, Uberlândia - MG');
    expect(localDaPagina({ ...base, endereco: 'Av. X, 10' })).toBe('Av. X, 10, Uberlândia - MG');
    expect(localDaPagina({ endereco: null, bairro: null, cidade: null, uf: null })).toBeNull();
    expect(linkMapa('Buffet', 'Centro, Uberlândia')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Buffet%2C%20Centro%2C%20Uberl%C3%A2ndia',
    );
  });
  it('JSON-LD sem nota nem avaliação e seguro para <script>', () => {
    const j = jsonLdNegocio({
      nome: 'Buffet </script>',
      url: 'https://x/b/a',
      descricao: null,
      imagem: null,
      telefoneE164: '+5534991355450',
      ...base,
    });
    expect(j).toMatchObject({ '@type': 'LocalBusiness', telephone: '+5534991355450' });
    expect(j).not.toHaveProperty('aggregateRating');
    expect(j).not.toHaveProperty('review');
    expect(serializarJsonLd(j)).not.toContain('</script>');
    expect(altPadrao('Buffet Demo', 2)).toBe('Foto 2 do espaço de Buffet Demo');
  });
});

describe('schemas do editor', () => {
  const E = '11111111-1111-4111-8111-111111111111';
  const U = '00000000-0000-4000-8000-000000000001';
  it('textos', () => {
    const ok = textosPaginaSchema.safeParse({
      slogan: 'Festa boa',
      estilo: '',
      diferenciais: ['Monitores'],
      bairro: '',
      endereco: '',
      mostrarEndereco: false,
    });
    expect(ok.success).toBe(true);
    const ruim = textosPaginaSchema.safeParse({
      slogan: 'x'.repeat(81),
      estilo: 'neon',
      diferenciais: ['A', 'b', 'b'],
      bairro: '',
      endereco: '',
      mostrarEndereco: false,
    });
    expect(ruim.success).toBe(false);
  });
  it('galeria: caminho da pasta galeria nas duas larguras, até 12', () => {
    const f = {
      caminho640: `${E}/galeria/${U}-640.webp`,
      caminho1280: `${E}/galeria/${U}-1280.webp`,
      largura: 1280,
      altura: 853,
      alt: '',
    };
    expect(galeriaSchema.safeParse([f]).success).toBe(true);
    expect(galeriaSchema.safeParse([{ ...f, caminho640: `${E}/capa/${U}.webp` }]).success).toBe(
      false,
    );
    expect(galeriaSchema.safeParse(Array(13).fill(f)).success).toBe(false);
  });
  it('depoimentos (6) e perguntas (8)', () => {
    const d = { nome: 'Ana', tipoFesta: '', texto: 'Festa linda demais!' };
    expect(depoimentosSchema.safeParse({ itens: Array(6).fill(d) }).success).toBe(true);
    expect(depoimentosSchema.safeParse({ itens: Array(7).fill(d) }).success).toBe(false);
    expect(depoimentosSchema.safeParse({ itens: [{ ...d, texto: 'curto' }] }).success).toBe(false);
    const p = { pergunta: 'Tem estacionamento?', resposta: 'Sim.' };
    expect(perguntasSchema.safeParse({ itens: Array(8).fill(p) }).success).toBe(true);
    expect(perguntasSchema.safeParse({ itens: Array(9).fill(p) }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  bioInstagram,
  mensagemAusenciaWhatsApp,
  postLancamento,
  respostaAutomaticaWhatsApp,
  statusWhatsApp,
  textosProntos,
} from '@/domain/divulgacao/textos';
import { calcularChecklist, type EstadoChecklist } from '@/domain/onboarding/checklist';
import {
  minutosDoOnboarding,
  passoValido,
  percentualProgresso,
  podeIrPara,
  textoProgresso,
} from '@/domain/onboarding/passos';
import {
  arredondarPara,
  faixasProporcionais,
  validarFaixas,
  validarPreco,
} from '@/domain/onboarding/precos';
import { ehRobo } from '@/domain/publico/robo';
import { linkComOrigem, origemDoParametro, ROTULO_ORIGEM } from '@/domain/publico/origem';

describe('passos do onboarding', () => {
  it('progresso e validação', () => {
    expect(textoProgresso(3)).toBe('passo 3 de 5');
    expect(percentualProgresso(1)).toBe(20);
    expect(percentualProgresso(5)).toBe(100);
    expect(passoValido('4')).toBe(4);
    expect(passoValido('9')).toBe(1);
    expect(passoValido(undefined)).toBe(1);
  });

  it('depois do passo 3 só com preço confirmado', () => {
    expect(podeIrPara(3, false)).toBe(true);
    expect(podeIrPara(4, false)).toBe(false);
    expect(podeIrPara(4, true)).toBe(true);
    expect(podeIrPara(6, true)).toBe(false);
  });

  it('tempo do onboarding em minutos', () => {
    const ini = new Date('2026-10-02T12:00:00Z');
    expect(minutosDoOnboarding(ini, new Date('2026-10-02T12:07:31Z'))).toBe(8);
    expect(minutosDoOnboarding(ini, null)).toBeNull();
  });
});

describe('preços do passo 3', () => {
  const modelo = [
    { ateConvidados: 30, valorCentavos: 290000 },
    { ateConvidados: 50, valorCentavos: 390000 },
    { ateConvidados: 80, valorCentavos: 560000 },
  ];

  it('faixas proporcionais ao modelo, arredondadas a R$ 10 (excedente a R$ 1)', () => {
    const r = faixasProporcionais(modelo, 7500, 350000);
    expect(r.faixas.map((f) => f.valorCentavos)).toEqual([350000, 471000, 676000]); // 4.706,90 → 4.710; 6.758,62 → 6.760
    expect(r.excedenteCentavos).toBe(9100); // 7500 × 350000/290000 = 9051,7 → R$ 91
  });

  it('valor igual ao do modelo mantém as faixas', () => {
    const r = faixasProporcionais(modelo, 7500, 290000);
    expect(r.faixas).toEqual(modelo);
    expect(r.excedenteCentavos).toBe(7500);
  });

  it('arredondamento meio para cima e mínimo de um passo', () => {
    expect(arredondarPara(1500, 1000)).toBe(2000);
    expect(arredondarPara(1499, 1000)).toBe(1000);
    expect(arredondarPara(10, 1000)).toBe(1000);
  });

  it('validação', () => {
    expect(validarPreco(null)).toBe('OBRIGATORIO');
    expect(validarPreco(0)).toBe('OBRIGATORIO');
    expect(validarPreco(4900_00)).toBeNull();
    expect(validarPreco(200_000_000)).toBe('MUITO_ALTO');
    expect(validarFaixas([])).toBe('OBRIGATORIO');
    expect(validarFaixas(modelo)).toBeNull();
    expect(validarFaixas([...modelo].reverse())).toBe('FAIXAS_FORA_DE_ORDEM');
  });
});

describe('checklist', () => {
  const vazio: EstadoChecklist = {
    pacoteConfirmado: false,
    tipoEventoAtivo: false,
    espacoETurnoAtivos: false,
    logo: false,
    capa: false,
    sobre: false,
    fotoEmPacote: false,
    cardapioCompleto: false,
    condicoesPagamento: false,
    textosProposta: false,
    dadosEmpresa: false,
    eventosNaAgenda: false,
    linkTestado: false,
    linkNaBio: false,
    pushAtivo: false,
    whatsappAvisos: null,
  };
  const tudo = Object.fromEntries(Object.keys(vazio).map((k) => [k, true])) as EstadoChecklist;

  it('vazio = 0%, completo = 100%', () => {
    expect(calcularChecklist(vazio)).toMatchObject({
      percentual: 0,
      linkFunciona: false,
      completo: false,
    });
    expect(calcularChecklist(tudo)).toMatchObject({
      percentual: 100,
      linkFunciona: true,
      completo: true,
      faltam: 0,
    });
  });

  it('obrigatórios pesam 3: só eles feitos dá 9/(9+12) = 42%', () => {
    const r = calcularChecklist({
      ...vazio,
      pacoteConfirmado: true,
      tipoEventoAtivo: true,
      espacoETurnoAtivos: true,
    });
    expect(r.linkFunciona).toBe(true);
    expect(r.percentual).toBe(42);
    expect(r.itens).toHaveLength(15); // WhatsApp de avisos fora (canal não configurado)
  });

  it('WhatsApp de avisos aparece quando o canal está configurado', () => {
    const r = calcularChecklist({ ...tudo, whatsappAvisos: false });
    expect(r.itens).toHaveLength(16);
    expect(r.percentual).toBe(Math.floor((21 * 100) / 22)); // 9 + 13 itens de peso 1
    expect(r.completo).toBe(false);
  });

  it('marcar "Fiz" na bio sobe o percentual; link na bio é manual', () => {
    const antes = calcularChecklist({ ...tudo, linkNaBio: false });
    const depois = calcularChecklist(tudo);
    expect(depois.percentual).toBeGreaterThan(antes.percentual);
    expect(antes.itens.find((i) => i.chave === 'linkNaBio')).toMatchObject({
      manual: true,
      feito: false,
    });
  });
});

describe('divulgação', () => {
  const d = {
    nome: ' Buffet  Alegria ',
    link: 'https://orkestra.app/b/buffet-alegria',
    cidade: 'Uberlândia',
  };

  it('links com a origem certa', () => {
    expect(linkComOrigem(d.link, 'qrcode')).toBe(`${d.link}?origem=qrcode`);
    expect(linkComOrigem(`${d.link}?x=1`, 'google')).toBe(`${d.link}?x=1&origem=google`);
    expect(linkComOrigem(d.link, 'link_direto')).toBe(d.link);
    expect(origemDoParametro('qrcode')).toBe('qrcode');
    expect(origemDoParametro('QR')).toBe('qrcode');
    expect(ROTULO_ORIGEM.qrcode).toBe('QR code');
  });

  it('cada texto leva o link com a origem e os dados do buffet', () => {
    expect(bioInstagram(d)).toContain(`${d.link}?origem=instagram`);
    expect(respostaAutomaticaWhatsApp(d)).toBe(
      `Oi! Monte seu orçamento em 2 minutos e veja as datas livres: ${d.link}?origem=whatsapp`,
    );
    expect(mensagemAusenciaWhatsApp(d)).toContain('do Buffet Alegria.');
    expect(mensagemAusenciaWhatsApp(d)).toContain('?origem=whatsapp');
    expect(postLancamento(d)).toContain('datas livres em Uberlândia');
    expect(postLancamento({ ...d, cidade: null })).not.toContain(' em ');
    expect(statusWhatsApp(d)).toMatch(/^Agora você monta o orçamento da sua festa sozinho/);
    const todos = textosProntos(d);
    expect(todos.map((t) => t.chave)).toEqual(['bio', 'resposta', 'ausencia', 'post', 'status']);
    for (const t of todos) expect(t.texto).not.toMatch(/undefined|null/);
  });

  it('bio do Instagram cabe em 150 caracteres com um link curto', () => {
    expect(bioInstagram({ ...d, link: 'https://ork.app/b/alegria' }).length).toBeLessThanOrEqual(
      150,
    );
  });
});

describe('robôs não contam visita', () => {
  it.each([
    ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', true],
    ['facebookexternalhit/1.1', true],
    ['WhatsApp/2.23.20.0 A', true],
    ['curl/8.4.0', true],
    ['', true],
    [null, true],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      false,
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36',
      false,
    ],
  ])('%s → %s', (ua, robo) => {
    expect(ehRobo(ua)).toBe(robo);
  });
});

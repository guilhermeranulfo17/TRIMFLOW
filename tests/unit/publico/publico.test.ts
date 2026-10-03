import { describe, expect, it } from 'vitest';
import { contextoDoModelo, idDoModelo, MODELOS } from '@/domain/modelos';
import type { ContextoPreco } from '@/domain/preco';
import {
  coresDaMarca,
  contraste,
  contextoSemDeslocamento,
  entradaDoMotor,
  ESCOLHAS_VAZIAS,
  hexValido,
  linkWhatsApp,
  mensagemDuvida,
  mensagemPreReserva,
  mensagemSemPacote,
  montarPrevia,
  montarVitrine,
  motivoDoBotaoDesabilitado,
  origemDoParametro,
  passoAnterior,
  passoPermitido,
  passoValido,
  pendenciasDoContexto,
  primeiroPasso,
  proximoPasso,
  resumoCardapio,
  rotuloSugestao,
  somenteAtivos,
  traduzirErroPublico,
  transicaoLead,
  dadosDoContexto,
  type Escolhas,
} from '@/domain/publico';
import { escolhasSchema } from '@/domain/validacao/publico';

const HOJE = '2026-09-30';
const SABADO = '2026-11-14';
const base = contextoDoModelo(MODELOS.infantil);
const tipo = idDoModelo.tipoEvento('aniversario-infantil');
const tarde = idDoModelo.turno('tarde');
const salao = idDoModelo.espaco('salao-principal');
const alegria = idDoModelo.pacote('alegria');

function ctxCom(regras: Partial<ContextoPreco['regras']>): ContextoPreco {
  return { ...base, regras: { ...base.regras, ...regras } };
}

const completo: Escolhas = {
  ...ESCOLHAS_VAZIAS,
  tipoEventoId: tipo,
  data: SABADO,
  turnoId: tarde,
  adultos: 40,
  criancas: [{ faixaIdadeId: idDoModelo.faixaIdade(1), quantidade: 10 }],
};

const motivo = (p: 1 | 2 | 3 | 4, e: Escolhas, c: ContextoPreco = base) =>
  motivoDoBotaoDesabilitado(p, e, dadosDoContexto(c, e));
const permitido = (
  p: 1 | 2 | 3 | 4 | 5 | 6,
  e: Escolhas,
  o: { temToken: boolean; tipoNaUrl?: boolean },
) => passoPermitido(p, e, dadosDoContexto(base, e), o);

describe('passos', () => {
  it('navegação e ?tipo= pulando o passo 1', () => {
    expect(primeiroPasso(false)).toBe(1);
    expect(primeiroPasso(true)).toBe(2);
    expect(proximoPasso(1)).toBe(2);
    expect(proximoPasso(6)).toBeNull();
    expect(passoAnterior(2)).toBe(1);
    expect(passoAnterior(2, true)).toBeNull();
    expect(passoAnterior(1)).toBeNull();
    expect(passoValido('4')).toBe(4);
    expect(passoValido('9')).toBeNull();
    expect(passoValido(undefined)).toBeNull();
  });

  it('motivo do botão desabilitado em cada passo', () => {
    const vazio = ESCOLHAS_VAZIAS;
    expect(motivo(1, vazio, base)).toBe('Escolha o tipo de festa.');
    expect(motivo(1, { ...vazio, tipoEventoId: tipo }, base)).toBeNull();
    const e2 = { ...vazio, tipoEventoId: tipo };
    expect(motivo(2, e2, base)).toBe('Escolha a data da festa.');
    expect(motivo(2, { ...e2, data: SABADO }, base)).toBe('Escolha o horário.');
    expect(motivo(2, { ...e2, data: SABADO, turnoId: tarde }, base)).toBe(
      'Informe quantos convidados.',
    );
    expect(motivo(2, { ...e2, data: SABADO, turnoId: tarde, adultos: 500 }, base)).toBe(
      'Salão principal recebe até 120 pessoas.',
    );
    expect(motivo(2, completo, base)).toBeNull();
    expect(motivo(3, completo, base)).toBeNull();
    expect(motivo(4, completo, base)).toBe('Escolha um pacote.');
    expect(motivo(4, { ...completo, pacoteId: alegria }, base)).toBeNull();
    expect(motivo(4, { ...completo, adultos: 5, criancas: [], pacoteId: alegria }, base)).toBe(
      'Esse pacote é a partir de 15 convidados.',
    );
  });

  it('com mais de um espaço, pede a escolha; no local do cliente, pede bairro e cidade', () => {
    const ctx: ContextoPreco = {
      ...base,
      espacos: [
        ...base.espacos,
        { id: 'casa', nome: 'Na sua casa', capacidadeMax: 80, noLocalDoCliente: true, ativo: true },
      ],
    };
    expect(motivo(2, completo, ctx)).toBe('Escolha o espaço.');
    expect(motivo(2, { ...completo, espacoId: 'casa' }, ctx)).toBe(
      'Informe o bairro e a cidade da festa.',
    );
    expect(
      motivo(2, { ...completo, espacoId: 'casa', localCliente: 'Centro, Uberlândia' }, ctx),
    ).toBeNull();
  });

  it('passo pedido na URL é limitado ao que já foi preenchido (e ao contato)', () => {
    expect(permitido(6, ESCOLHAS_VAZIAS, { temToken: false })).toBe(1);
    expect(permitido(5, completo, { temToken: false })).toBe(3);
    expect(permitido(5, completo, { temToken: true })).toBe(4);
    expect(permitido(5, { ...completo, pacoteId: alegria }, { temToken: true })).toBe(5);
    expect(permitido(1, completo, { temToken: true, tipoNaUrl: true })).toBe(2);
  });
});

describe('prévia de preço por modo de exibição', () => {
  it('antes do WhatsApp: "a partir de" no exato e na faixa; nada no após contato', () => {
    for (const modo of ['exato', 'faixa'] as const) {
      const p = montarPrevia(ctxCom({ modoExibicaoPreco: modo }), completo, {
        hoje: HOJE,
        comContato: false,
        modo,
      });
      expect(p.aPartirDeCentavos).toBeGreaterThan(0);
      expect(p.totalCentavos).toBeNull();
      expect(p.pacotes).toEqual([]);
      expect(p.resultado).toBeNull();
    }
    const nada = montarPrevia(ctxCom({ modoExibicaoPreco: 'apos_contato' }), completo, {
      hoje: HOJE,
      comContato: false,
      modo: 'apos_contato',
    });
    expect(nada).toEqual({
      totalCentavos: null,
      aPartirDeCentavos: null,
      pacotes: [],
      opcionais: [],
      resultado: null,
      horaExtraCentavos: null,
      avisos: [],
    });
  });

  it('depois do WhatsApp: total por pacote, extras e resultado completo', () => {
    const p = montarPrevia(
      base,
      { ...completo, pacoteId: alegria },
      {
        hoje: HOJE,
        comContato: true,
        modo: 'apos_contato',
      },
    );
    expect(p.pacotes.length).toBeGreaterThan(1);
    expect(p.pacotes.every((x) => x.totalCentavos !== null)).toBe(true);
    expect(p.resultado?.ok).toBe(true);
    expect(p.totalCentavos).toBe(p.resultado?.totalCentavos);
    expect(p.pacotes.find((x) => x.id === alegria)?.totalCentavos).toBe(p.totalCentavos);
    expect(p.opcionais.length).toBeGreaterThan(0);
  });

  it('sem tipo de festa, nada; sem pacote, sem total', () => {
    expect(
      montarPrevia(base, ESCOLHAS_VAZIAS, { hoje: HOJE, comContato: true, modo: 'exato' })
        .aPartirDeCentavos,
    ).toBeNull();
    const p = montarPrevia(base, completo, { hoje: HOJE, comContato: true, modo: 'exato' });
    expect(p.totalCentavos).toBeNull();
    expect(p.resultado).toBeNull();
  });

  it('o motor roda no canal público, sem desconto e com limite zero', () => {
    const entrada = entradaDoMotor(base, { ...completo, pacoteId: alegria }, HOJE)!;
    expect(entrada).toMatchObject({
      canal: 'publico',
      hoje: HOJE,
      limiteDescontoBp: 0,
      espacoId: salao,
    });
    expect(entrada.desconto).toBeUndefined();
    expect(entrada.itensAvulsos).toBeUndefined();
    expect(entradaDoMotor(base, completo, HOJE)).toBeNull();
  });

  it('o schema das escolhas descarta preço, desconto e total vindos do navegador', () => {
    const r = escolhasSchema.parse({
      ...completo,
      pacoteId: alegria.replace('pacote:alegria', '9a000000-0000-4000-8000-000000000001'),
      tipoEventoId: '9a000000-0000-4000-8000-000000000002',
      turnoId: '9a000000-0000-4000-8000-000000000003',
      criancas: [],
      desconto: { tipo: 'percentual', bp: 5000 },
      totalCentavos: 1,
      hoje: '2000-01-01',
    });
    expect(Object.keys(r)).not.toContain('desconto');
    expect(Object.keys(r)).not.toContain('totalCentavos');
    expect(Object.keys(r)).not.toContain('hoje');
  });

  it('espaço no local do cliente: calcula sem deslocamento e avisa', () => {
    const casa = {
      id: 'casa',
      nome: 'Na sua casa',
      capacidadeMax: 80,
      noLocalDoCliente: true,
      ativo: true,
    };
    const ctx: ContextoPreco = {
      ...base,
      espacos: [casa],
      regras: { ...base.regras, deslocamentoModelo: 'por_km', deslocamentoValorKmCentavos: 300 },
    };
    const p = montarPrevia(
      ctx,
      { ...completo, pacoteId: alegria, localCliente: 'Centro' },
      {
        hoje: HOJE,
        comContato: true,
        modo: 'exato',
      },
    );
    expect(p.resultado?.ok).toBe(true);
    expect(p.resultado?.linhas.some((l) => l.tipo === 'deslocamento')).toBe(false);
    expect(p.avisos[0]).toMatch(/deslocamento/);
    expect(contextoSemDeslocamento(ctx).regras.deslocamentoModelo).toBe('nenhum');
  });
});

describe('vitrine (o que o navegador recebe antes do WhatsApp)', () => {
  const centavosNoJson = (v: unknown) =>
    JSON.stringify(v).match(
      /"(precoPessoaCentavos|valorExcedenteCentavos|valorCentavos|fatorBp|ajusteBp|precoCentavos|valorHoraExtraCentavos|faixasPreco)"/g,
    ) ?? [];

  it('nunca leva tabelas de preço, em nenhum modo', () => {
    for (const modo of ['exato', 'faixa', 'apos_contato'] as const) {
      const v = montarVitrine(ctxCom({ modoExibicaoPreco: modo }), {}, HOJE);
      expect(centavosNoJson(v)).toEqual([]);
    }
  });

  it('exato: "a partir de" geral e por pacote; faixa: só geral; após contato: nenhum', () => {
    const exato = montarVitrine(ctxCom({ modoExibicaoPreco: 'exato' }), {}, HOJE);
    expect(exato.aPartirDeCentavos).toBeGreaterThan(0);
    expect(exato.pacotes.every((p) => (p.aPartirDeCentavos ?? 0) > 0)).toBe(true);
    const faixa = montarVitrine(ctxCom({ modoExibicaoPreco: 'faixa' }), {}, HOJE);
    expect(faixa.aPartirDeCentavos).toBe(exato.aPartirDeCentavos);
    expect(faixa.pacotes.every((p) => p.aPartirDeCentavos === null)).toBe(true);
    const apos = montarVitrine(ctxCom({ modoExibicaoPreco: 'apos_contato' }), {}, HOJE);
    expect(apos.aPartirDeCentavos).toBeNull();
    expect(apos.pacotes.every((p) => p.aPartirDeCentavos === null)).toBe(true);
    expect(JSON.stringify(apos)).not.toMatch(/Centavos":\d/);
  });

  it('leva fotos e descrição dos extras e só itens ativos', () => {
    const ctx: ContextoPreco = {
      ...base,
      pacotes: base.pacotes.map((p, i) => (i === 0 ? { ...p, ativo: false } : p)),
    };
    const v = montarVitrine(ctx, { [alegria]: { descricao: 'Desc', fotos: ['a.webp'] } }, HOJE);
    expect(v.pacotes.find((p) => p.id === alegria)).toBeUndefined();
    const v2 = montarVitrine(base, { [alegria]: { descricao: 'Desc', fotos: ['a.webp'] } }, HOJE);
    expect(v2.pacotes.find((p) => p.id === alegria)).toMatchObject({
      descricao: 'Desc',
      fotos: ['a.webp'],
    });
    expect(v2.faixasIdade.every((f) => !('fatorBp' in f))).toBe(true);
  });
});

describe('contexto', () => {
  it('pendências a partir do contexto', () => {
    expect(pendenciasDoContexto(base)).toEqual([]);
    const vazio: ContextoPreco = { ...base, pacotes: [], tiposEvento: [], turnos: [], espacos: [] };
    expect(pendenciasDoContexto(vazio).map((p) => p.codigo)).toEqual([
      'SEM_PACOTE_COM_PRECO',
      'SEM_TIPO_EVENTO_ATIVO',
      'SEM_TURNO_ATIVO',
      'SEM_ESPACO_ATIVO',
    ]);
  });

  it('somenteAtivos remove inativos e faixas de pacotes inativos', () => {
    const ctx: ContextoPreco = {
      ...base,
      pacotes: base.pacotes.map((p) => (p.id === alegria ? { ...p, ativo: false } : p)),
      faixasIdade: [
        ...base.faixasIdade,
        {
          id: 'fx',
          rotulo: 'x',
          idadeMin: 0,
          idadeMax: 3,
          fatorBp: 0,
          pacoteId: alegria,
          ordem: 9,
        },
      ],
      turnos: base.turnos.map((t) => (t.id === tarde ? { ...t, ativo: false } : t)),
    };
    const a = somenteAtivos(ctx);
    expect(a.pacotes.some((p) => p.id === alegria)).toBe(false);
    expect(a.faixasIdade.some((f) => f.id === 'fx')).toBe(false);
    expect(a.turnos.some((t) => t.id === tarde)).toBe(false);
  });
});

describe('origem, WhatsApp, cardápio, sugestões e mensagens', () => {
  it('origem do parâmetro', () => {
    expect(origemDoParametro('instagram')).toBe('instagram');
    expect(origemDoParametro('IG')).toBe('instagram');
    expect(origemDoParametro(['google', 'x'])).toBe('google');
    expect(origemDoParametro('zap')).toBe('whatsapp');
    expect(origemDoParametro('tiktok')).toBe('link_direto');
    expect(origemDoParametro(undefined)).toBe('link_direto');
    expect(origemDoParametro('')).toBe('link_direto');
  });

  it('links e mensagens de WhatsApp', () => {
    expect(linkWhatsApp('+5534991355450')).toBe('https://wa.me/5534991355450');
    expect(linkWhatsApp('+5534991355450', 'Oi, tudo bem?')).toBe(
      'https://wa.me/5534991355450?text=Oi%2C%20tudo%20bem%3F',
    );
    expect(mensagemDuvida('Buffet X')).toContain('tirar uma dúvida');
    const r = {
      numero: 12,
      tipoEvento: 'Aniversário infantil',
      data: SABADO,
      turno: 'Tarde',
      convidados: 50,
      totalCentavos: 650_000,
    };
    expect(mensagemDuvida('Buffet X', r)).toBe(
      'Olá, Buffet X! Montei o orçamento nº 12 (total R$ 6.500,00) pelo link: Aniversário infantil · 14/11/2026 · Tarde · 50 convidados. Queria tirar uma dúvida.',
    );
    expect(mensagemPreReserva('Buffet X', r)).toContain('pré-reserva');
    expect(mensagemSemPacote('Buffet X', r)).toContain('Não encontrei um pacote');
  });

  it('resumo do cardápio', () => {
    expect(resumoCardapio([])).toBeNull();
    expect(resumoCardapio([{ nome: 'Salgados', itens: ['a', 'b'] }])).toBe('Salgados · 2 itens');
    expect(
      resumoCardapio([
        { nome: 'Salgados', itens: ['a'] },
        { nome: 'Bebidas', itens: [] },
        { nome: 'Doces', itens: ['b'] },
        { nome: 'Bolo', itens: ['c'] },
      ]),
    ).toBe('Salgados, Doces e Bolo · 3 itens');
    expect(resumoCardapio([{ nome: 'Bolo', itens: ['c'] }])).toBe('Bolo · 1 item');
  });

  it('rótulo da sugestão de data', () => {
    const turnos = [{ id: tarde, nome: 'Tarde', horaInicio: '15:00' }];
    expect(rotuloSugestao({ data: SABADO, turnoId: tarde }, turnos)).toBe(
      'sáb, 14/11/2026 · Tarde (15:00)',
    );
    expect(rotuloSugestao({ data: SABADO, turnoId: 'x' }, turnos)).toBe('sáb, 14/11/2026');
  });

  it('erros do banco viram mensagens simples', () => {
    expect(traduzirErroPublico('LIMITE_EXCEDIDO')).toBe(
      'Muitas tentativas. Tente de novo em alguns minutos.',
    );
    expect(traduzirErroPublico('AGENDA_SLOT_OCUPADO')).toMatch(/ocupado/);
    expect(traduzirErroPublico('XYZ')).toMatch(/Tente de novo/);
    expect(traduzirErroPublico(undefined)).toMatch(/Tente de novo/);
  });
});

describe('cor da marca', () => {
  it('cor inválida vira o verde-petróleo padrão', () => {
    expect(hexValido('#12345')).toBe(false);
    expect(coresDaMarca('vermelho').base).toBe('#0F766E');
    expect(coresDaMarca(null).base).toBe('#0F766E');
  });

  it('texto sobre a base e destaque sobre branco sempre com contraste AA', () => {
    for (const cor of [
      '#0F766E',
      '#FFEB3B',
      '#00BCD4',
      '#111111',
      '#FFFFFF',
      '#E91E63',
      '#8BC34A',
    ]) {
      const c = coresDaMarca(cor);
      expect(contraste(c.base, c.texto)).toBeGreaterThanOrEqual(3);
      expect(contraste(c.destaque, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    }
    expect(coresDaMarca('#FFEB3B').texto).toBe('#161616');
    expect(coresDaMarca('#111111').texto).toBe('#FFFFFF');
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});

describe('status do lead', () => {
  const t = (
    status: Parameters<typeof transicaoLead>[0]['status'],
    temperatura = 'frio' as const,
    evento: Parameters<typeof transicaoLead>[1],
  ) => transicaoLead({ status, temperatura }, evento);

  it('segue a tabela da etapa', () => {
    expect(t('novo', 'frio', 'orcamento_concluido')).toEqual({
      status: 'em_andamento',
      temperatura: 'morno',
    });
    expect(t('em_andamento', 'frio', 'pre_reserva_pedida')).toEqual({
      status: 'pre_reservado',
      temperatura: 'quente',
    });
    expect(t('em_andamento', 'frio', 'visita_pedida')).toEqual({
      status: 'em_andamento',
      temperatura: 'quente',
    });
    expect(t('pre_reservado', 'frio', 'pre_reserva_vencida').status).toBe('em_andamento');
    expect(t('pre_reservado', 'frio', 'reserva_confirmada').status).toBe('reservado');
    expect(t('reservado', 'frio', 'reserva_cancelada').status).toBe('cancelado');
    expect(t('reservado', 'frio', 'realizada').status).toBe('realizado');
    expect(t('novo', 'frio', 'abandonou').status).toBe('abandonou');
    expect(t('em_andamento', 'frio', 'abandonou').status).toBe('em_andamento');
  });

  it('voltar não faz pré-reservado nem reservado regredirem', () => {
    for (const s of ['abandonou', 'frio', 'novo', 'perdido', 'cancelado', 'realizado'] as const) {
      expect(t(s, 'frio', 'voltou').status).toBe('em_andamento');
    }
    expect(t('pre_reservado', 'frio', 'voltou').status).toBe('pre_reservado');
    expect(t('reservado', 'frio', 'voltou').status).toBe('reservado');
    expect(t('reservado', 'frio', 'pre_reserva_pedida').status).toBe('reservado');
    expect(
      transicaoLead({ status: 'pre_reservado', temperatura: 'quente' }, 'orcamento_concluido'),
    ).toEqual({
      status: 'pre_reservado',
      temperatura: 'quente',
    });
  });
});

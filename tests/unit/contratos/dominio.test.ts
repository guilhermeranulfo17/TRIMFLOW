import { describe, expect, it } from 'vitest';
import {
  AVISO_MODELO,
  CPF_NA_ASSINATURA,
  MODELOS_PADRAO,
  OPCOES_PADRAO,
  NOMES_VARIAVEIS,
  analisarModelo,
  arquivoContrato,
  blocosDoContrato,
  blocosDoTexto,
  conferirIntegridade,
  contratoEditavel,
  cpfLimpo,
  duracaoPorExtenso,
  hashEmBlocos,
  hashTexto,
  horarioDaFesta,
  lerOpcoes,
  mascararCpf,
  mascararEmail,
  nomeCompletoValido,
  normalizarTexto,
  numeroContrato,
  numeroPorExtenso,
  opcoesContratoSchema,
  preencherModelo,
  proximoStatusContrato,
  statusEfetivo,
  textoCancelamento,
  trechosComFalta,
  valorComExtenso,
  valorPorExtenso,
  valoresDoContrato,
  type FonteContrato,
  type StatusContrato,
} from '@/domain/contratos';

describe('números e valores por extenso', () => {
  it.each([
    [0, 'zero'],
    [1, 'um'],
    [10, 'dez'],
    [16, 'dezesseis'],
    [21, 'vinte e um'],
    [100, 'cem'],
    [101, 'cento e um'],
    [999, 'novecentos e noventa e nove'],
    [1000, 'mil'],
    [1001, 'mil e um'],
    [1100, 'mil e cem'],
    [1500, 'mil e quinhentos'],
    [1550, 'mil quinhentos e cinquenta'],
    [2000, 'dois mil'],
    [21_345, 'vinte e um mil trezentos e quarenta e cinco'],
    [100_000, 'cem mil'],
    [1_000_000, 'um milhão'],
    [2_000_500, 'dois milhões e quinhentos'],
    [1_300_000, 'um milhão e trezentos mil'],
  ])('%i = %s', (n, texto) => {
    expect(numeroPorExtenso(n)).toBe(texto);
  });

  it.each([
    [150000, 'mil e quinhentos reais'],
    [150050, 'mil e quinhentos reais e cinquenta centavos'],
    [100, 'um real'],
    [101, 'um real e um centavo'],
    [1, 'um centavo'],
    [0, 'zero real'],
    [100_000_000, 'um milhão de reais'],
    [703237, 'sete mil e trinta e dois reais e trinta e sete centavos'],
  ])('%i centavos = %s', (c, texto) => {
    expect(valorPorExtenso(c)).toBe(texto);
  });

  it('valor com extenso entre parênteses', () => {
    expect(valorComExtenso(250000)).toBe('R$ 2.500,00 (dois mil e quinhentos reais)');
  });

  it('recusa negativo e não inteiro', () => {
    expect(() => numeroPorExtenso(-1)).toThrow(RangeError);
    expect(() => valorPorExtenso(1.5)).toThrow(RangeError);
  });
});

describe('status do contrato', () => {
  it('caminho feliz: enviado → concluído pela assinatura do cliente', () => {
    expect(proximoStatusContrato('rascunho', 'enviar')).toBe('enviado');
    expect(proximoStatusContrato('enviado', 'assinar_cliente')).toBe('concluido');
  });

  it('concluído e cancelado não mudam mais', () => {
    for (const s of ['concluido', 'cancelado'] as StatusContrato[]) {
      for (const e of ['enviar', 'assinar_cliente', 'recusar', 'expirar', 'cancelar'] as const) {
        expect(proximoStatusContrato(s, e)).toBeNull();
      }
    }
  });

  it('recusado e expirado só podem ser cancelados (e refeitos)', () => {
    expect(proximoStatusContrato('recusado', 'assinar_cliente')).toBeNull();
    expect(proximoStatusContrato('expirado', 'assinar_cliente')).toBeNull();
    expect(proximoStatusContrato('recusado', 'cancelar')).toBe('cancelado');
  });

  it('só o rascunho é editável', () => {
    expect(contratoEditavel('rascunho')).toBe(true);
    expect(contratoEditavel('enviado')).toBe(false);
  });

  it('enviado vencido conta como expirado na leitura', () => {
    const agora = new Date('2026-10-10T12:00:00Z');
    expect(statusEfetivo('enviado', '2026-10-10T11:59:59Z', agora)).toBe('expirado');
    expect(statusEfetivo('enviado', '2026-10-10T12:00:01Z', agora)).toBe('enviado');
    expect(statusEfetivo('concluido', '2020-01-01T00:00:00Z', agora)).toBe('concluido');
  });
});

describe('impressão digital (SHA-256)', () => {
  it('hash conhecido', () => {
    expect(hashTexto('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('normaliza antes: quebras, espaços no fim e Unicode', () => {
    const a = normalizarTexto('Cláusula 1\r\nTexto   \r\n\r\n\r\n\r\nFim\n');
    expect(a).toBe('Cláusula 1\nTexto\n\nFim');
    // "á" decomposto (a + acento) vira o mesmo hash que o composto
    expect(hashTexto(normalizarTexto('á'))).toBe(hashTexto(normalizarTexto('á')));
  });

  it('confere a integridade e percebe uma vírgula a mais', () => {
    const t = normalizarTexto('Valor: R$ 1.000,00');
    const h = hashTexto(t);
    expect(conferirIntegridade(t, h)).toBe(true);
    expect(conferirIntegridade(`${t},`, h)).toBe(false);
    expect(conferirIntegridade(t, 'xyz')).toBe(false);
  });

  it('hash em blocos de 4 para o comprovante', () => {
    expect(hashEmBlocos('ab12cd34ef')).toBe('AB12 CD34 EF');
  });
});

describe('quem assina', () => {
  it.each([
    ['Ana Souza', true],
    ['ana  souza ', true],
    ["Maria D'Ávila", true],
    ['João da Silva-Neto', true],
    ['Ana', false],
    ['A B', false],
    ['Ana S', false],
    ['Ana 123', false],
    ['', false],
  ])('nome "%s" → %s', (nome, ok) => {
    expect(nomeCompletoValido(nome)).toBe(ok);
  });

  it('CPF pelos dígitos verificadores', () => {
    expect(cpfLimpo('529.982.247-25')).toBe('52998224725');
    expect(cpfLimpo('529.982.247-26')).toBeNull();
    expect(cpfLimpo('111.111.111-11')).toBeNull();
    expect(cpfLimpo('123')).toBeNull();
  });

  it('CPF mascarado mostra só o meio', () => {
    expect(mascararCpf('52998224725')).toBe('***.982.247-**');
    expect(mascararCpf('x')).toBe('***.***.***-**');
  });

  it('e-mail mascarado', () => {
    expect(mascararEmail('joana@gmail.com')).toBe('j***@gmail.com');
    expect(mascararEmail('invalido')).toBe('***');
  });
});

describe('modelo: análise das variáveis', () => {
  it('os três modelos do sistema são válidos e usam só variáveis conhecidas', () => {
    for (const m of Object.values(MODELOS_PADRAO)) {
      const a = analisarModelo(m.texto);
      expect(a.erros).toEqual([]);
      expect(a.variaveis.length).toBeGreaterThan(10);
      expect(m.texto).not.toMatch(/—/); // nada de travessão
    }
    expect(AVISO_MODELO).toMatch(/advogado/);
  });

  it('o modelo infantil traz as cláusulas pedidas', () => {
    const t = MODELOS_PADRAO.infantil.texto;
    for (const trecho of [
      'Quem são as partes',
      'O que está sendo contratado',
      'Valor e forma de pagamento',
      'Reserva da data',
      'Cancelamento e remarcação',
      'Convidados a mais ou a menos',
      'Horas extras',
      'Responsabilidades do CONTRATANTE',
      'Responsabilidades do CONTRATADO',
      'força maior',
      'Itens trazidos de fora',
      'Uso de imagem',
      'LGPD',
      'Foro',
      'Assinatura eletrônica',
      'alergia',
      'menores de idade',
    ]) {
      expect(t.toLowerCase()).toContain(trecho.toLowerCase());
    }
  });

  it('acusa variável desconhecida, bloco aberto e chaves soltas', () => {
    expect(analisarModelo('Oi {{nome_cliente}}').erros[0]).toMatch(/desconhecida/);
    expect(analisarModelo('{{#uso_imagem}} sem fim').erros[0]).toMatch(/não foi fechado/);
    expect(analisarModelo('{{/uso_imagem}}').erros[0]).toMatch(/não tem começo/);
    expect(analisarModelo('Oi {{cliente_nome}').ok).toBe(false);
    expect(analisarModelo('{{#uso_imagem}}{{#uso_imagem}}{{/uso_imagem}}').ok).toBe(false);
    expect(analisarModelo('   ').erros[0]).toMatch(/vazio/);
    expect(analisarModelo('Oi {{ cliente_nome }}, tudo bem?').ok).toBe(true);
  });
});

describe('preenchimento', () => {
  it('troca as variáveis e acusa as que faltam', () => {
    const r = preencherModelo('Oi {{cliente_nome}}, CNPJ {{buffet_cnpj}}.', {
      cliente_nome: 'Ana Souza',
      buffet_cnpj: '  ',
    });
    expect(r.faltando).toEqual(['buffet_cnpj']);
    expect(r.texto).toBe('Oi Ana Souza, CNPJ [[FALTA:buffet_cnpj]].');
    expect(trechosComFalta(r.texto)).toEqual([
      { texto: 'Oi Ana Souza, CNPJ ' },
      { texto: '[[FALTA:buffet_cnpj]]', falta: 'buffet_cnpj' },
      { texto: '.' },
    ]);
  });

  it('bloco ligado fica, desligado sai inteiro', () => {
    const modelo = 'A\n{{#uso_imagem}}\n## Imagem\nTexto\n{{/uso_imagem}}\nB';
    expect(preencherModelo(modelo, {}, { uso_imagem: true }).texto).toBe('A\n## Imagem\nTexto\nB');
    expect(preencherModelo(modelo, {}, { uso_imagem: false }).texto).toBe('A\nB');
  });

  it('modelo inválido lança erro', () => {
    expect(() => preencherModelo('{{xyz}}', {})).toThrow(/inválido/);
  });
});

describe('opções e cancelamento', () => {
  it('texto das faixas em ordem de antecedência', () => {
    expect(textoCancelamento(OPCOES_PADRAO.cancelamento)).toBe(
      [
        '- Com 90 dias ou mais de antecedência: multa de 10% do valor total.',
        '- De 30 a 89 dias: multa de 30% do valor total.',
        '- Com menos de 30 dias: multa de 50% do valor total.',
      ].join('\n'),
    );
    expect(textoCancelamento([{ diasAntes: 0, multaBp: 0 }])).toBe(
      '- A qualquer momento: sem multa.',
    );
  });

  it('valida as opções e cai no padrão quando o guardado é ruim', () => {
    expect(
      opcoesContratoSchema.safeParse({
        ...OPCOES_PADRAO,
        cancelamento: [{ diasAntes: 30, multaBp: 100 }],
      }).success,
    ).toBe(false);
    expect(lerOpcoes(null)).toEqual(OPCOES_PADRAO);
    expect(lerOpcoes({ usoImagem: true }).usoImagem).toBe(true);
    expect(lerOpcoes({ remarcacaoDias: -3 })).toEqual(OPCOES_PADRAO);
  });
});

const FONTE: FonteContrato = {
  hoje: '2026-10-05',
  cliente: { nome: 'Ana Souza', whatsappE164: '+5534991355450', email: 'ana@exemplo.com' },
  buffet: {
    nome: 'Buffet Alegria',
    razaoSocial: 'Alegria Festas Ltda',
    cnpj: '11222333000181',
    endereco: 'Rua das Flores, 100',
    cidade: 'Uberlândia',
    uf: 'MG',
    whatsappE164: '+5534999990000',
  },
  festa: {
    tipoEvento: 'Aniversário infantil',
    data: '2026-11-14',
    horaInicio: '15:00',
    duracaoMin: 270,
    espaco: 'Salão Principal',
    convidados: 80,
    pacote: 'Pacote Completo',
    itens: ['Buffet completo', 'Monitores'],
    naoIncluso: 'Bolo',
  },
  valores: { totalCentavos: 750000, sinalCentavos: 225000, saldoCentavos: 525000 },
  formasPagamento: ['Pix', 'Cartão de crédito', 'Boleto'],
  prazoSaldoDias: 7,
  horaExtraCentavos: 45000,
  alteracaoConvidados: 'Até 10% a mais sem custo.',
  opcoes: OPCOES_PADRAO,
};

describe('valores do contrato', () => {
  it('formata tudo em pt-BR', () => {
    const v = valoresDoContrato(FONTE);
    expect(v.cliente_cpf).toBe(CPF_NA_ASSINATURA);
    expect(v.cliente_whatsapp).toBe('(34) 99135-5450');
    expect(v.buffet_cnpj).toBe('11.222.333/0001-81');
    expect(v.buffet_cidade).toBe('Uberlândia/MG');
    expect(v.data_evento).toBe('sábado, 14 de novembro de 2026');
    expect(v.horario).toBe('das 15:00 às 19:30');
    expect(v.duracao).toBe('4 horas e 30 minutos');
    expect(v.convidados).toBe('80 convidados');
    expect(v.itens).toBe('- Buffet completo\n- Monitores');
    expect(v.valor_total).toBe('R$ 7.500,00 (sete mil e quinhentos reais)');
    expect(v.sinal).toBe('R$ 2.250,00 (dois mil duzentos e cinquenta reais)');
    expect(v.forma_pagamento).toBe('Pix, Cartão de crédito e Boleto');
    expect(v.prazo_saldo).toBe('até 7 dias antes da festa');
    expect(v.hora_extra).toBe('R$ 450,00');
    expect(v.prazo_cancelamento).toBe('30 dias');
    expect(v.data_contrato).toBe('5 de outubro de 2026');
  });

  it('o modelo infantil sai completo com uma fonte completa', () => {
    const m = MODELOS_PADRAO.infantil;
    const r = preencherModelo(m.texto, valoresDoContrato(FONTE), blocosDoContrato(m.opcoes));
    expect(r.faltando).toEqual([]);
    expect(r.texto).not.toMatch(/\{\{|\[\[FALTA/);
    expect(r.texto).not.toContain('Uso de imagem');
  });

  it('o que falta vira lista (CNPJ, endereço, valores)', () => {
    const r = preencherModelo(
      MODELOS_PADRAO.infantil.texto,
      valoresDoContrato({
        ...FONTE,
        buffet: { ...FONTE.buffet, cnpj: null, endereco: ' ' },
        valores: null,
      }),
    );
    expect(r.faltando).toEqual(
      expect.arrayContaining(['buffet_cnpj', 'buffet_endereco', 'valor_total', 'sinal', 'saldo']),
    );
  });

  it('horário que passa da meia-noite e durações', () => {
    expect(horarioDaFesta('22:00', 180)).toBe('das 22:00 às 01:00 do dia seguinte');
    expect(duracaoPorExtenso(60)).toBe('1 hora');
    expect(duracaoPorExtenso(45)).toBe('45 minutos');
  });

  it('toda variável tem rótulo', () => {
    expect(NOMES_VARIAVEIS.length).toBeGreaterThan(25);
  });
});

describe('texto em blocos, número e arquivo', () => {
  it('títulos, cláusulas, parágrafos e listas', () => {
    expect(
      blocosDoTexto('# Contrato\n\n## 1. Partes\nLinha 1\nLinha 2\n\n- a\n- b\nDepois'),
    ).toEqual([
      { tipo: 'titulo', texto: 'Contrato' },
      { tipo: 'clausula', texto: '1. Partes' },
      { tipo: 'paragrafo', texto: 'Linha 1 Linha 2' },
      { tipo: 'lista', itens: ['a', 'b'] },
      { tipo: 'paragrafo', texto: 'Depois' },
    ]);
  });

  it('número e nome do arquivo', () => {
    expect(numeroContrato(2026, 7)).toBe('2026-0007');
    const a = arquivoContrato({ codigo: '2026-0007', buffet: 'Buffet Ação', cliente: 'Ana/Souza' });
    expect(a.nome).toBe('Contrato 2026-0007 - Buffet Ação - Ana Souza.pdf');
    expect(a.contentDisposition).toContain(
      'filename="Contrato 2026-0007 - Buffet Acao - Ana Souza.pdf"',
    );
  });
});

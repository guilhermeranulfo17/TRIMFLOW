import { describe, expect, it } from 'vitest';
import { contextoDoModelo, idDoModelo, MODELOS } from '@/domain/modelos';
import { calcularOrcamento } from '@/domain/preco';
import {
  arquivoProposta,
  congelarConteudo,
  dataPorExtenso,
  diferencasEntreVersoes,
  estadoValidade,
  montarConteudo,
  numeroProposta,
  preencherAbertura,
  temperaturaPorAberturas,
  textoDoModelo,
  type BuffetProposta,
  type VersaoProposta,
} from '@/domain/proposta';
import { entradaDoMotor, ESCOLHAS_VAZIAS, type Escolhas } from '@/domain/publico';
import { cnpjValido, limparCnpj, mascaraCnpj } from '@/domain/validacao/cnpj';

const HOJE = '2026-09-30';
const SABADO = '2026-11-14';
const TEXTOS = {
  condicoes: 'Sinal por Pix.',
  formasPagamento: ['Pix', 'Cartão de crédito', 'Boleto'],
  naoIncluso: 'Bebidas alcoólicas.',
  cancelamento: 'Sinal não devolvido com menos de 30 dias.',
  alteracaoConvidados: 'Até 7 dias antes.',
};
const BUFFET: BuffetProposta = {
  nome: 'Buffet X',
  logoUrl: null,
  corMarca: '#E91E63',
  razaoSocial: 'Buffet X Festas Ltda',
  cnpj: '11222333000181',
  endereco: 'Rua das Flores, 100 - Centro',
  whatsappE164: '+5534991355450',
  rodapeOrkestra: true,
};

/** Versão congelada de um modelo de segmento (o que o servidor grava ao concluir). */
function versaoDoModelo(segmento: keyof typeof MODELOS): VersaoProposta {
  const ctx = contextoDoModelo(MODELOS[segmento]);
  const tipo = ctx.tiposEvento[0]!;
  const pacote = ctx.pacotes.find(
    (p) => p.tiposEventoIds.length === 0 || p.tiposEventoIds.includes(tipo.id),
  )!;
  const turno = ctx.turnos.find((t) => t.diasSemana.includes(6))!;
  const faixa = ctx.faixasIdade.find((f) => f.pacoteId === null);
  const escolhas: Escolhas = {
    ...ESCOLHAS_VAZIAS,
    tipoEventoId: tipo.id,
    data: SABADO,
    turnoId: turno.id,
    espacoId: ctx.espacos.find((e) => e.ativo)!.id,
    adultos: Math.max(pacote.minConvidados, 40),
    criancas: faixa ? [{ faixaIdadeId: faixa.id, quantidade: 5 }] : [],
    pacoteId: pacote.id,
    localCliente: 'Centro',
  };
  const ctxSemDesloc = { ...ctx, regras: { ...ctx.regras, deslocamentoModelo: 'nenhum' as const } };
  const r = calcularOrcamento(ctxSemDesloc, entradaDoMotor(ctxSemDesloc, escolhas, HOJE)!);
  expect(r.ok).toBe(true);
  return {
    numero: 42,
    versao: 2,
    status: 'enviado',
    emitidaEm: '2026-09-30T15:00:00Z',
    validadeAte: '2026-10-15',
    hoje: HOJE,
    resultado: r,
    conteudo: congelarConteudo({
      ctx,
      escolhas,
      textos: TEXTOS,
      aberturaModelo:
        'Olá, {nome}! Proposta para {tipo} em {data}, {convidados} convidados no {buffet}. {xyz}',
      clienteNome: 'Ana Souza',
      buffetNome: 'Buffet X',
    }),
    itens: r.linhas.map((l) => ({
      tipo: l.tipo,
      descricao: l.descricao,
      quantidade: l.quantidade,
      subtotalCentavos: l.subtotalCentavos,
      detalhe: l.detalhe,
    })),
    totalCentavos: r.totalCentavos,
    data: SABADO,
    convidados: r.pessoasFisicas,
    tipoEvento: tipo.nome,
    turno: { nome: turno.nome, horaInicio: turno.horaInicio },
    espaco: 'Salão',
    clienteNome: 'Ana Souza',
    observacoes: 'Decoração azul.',
  };
}

describe('modelo de conteúdo da proposta', () => {
  it.each(['infantil', 'eventos', 'domicilio'] as const)(
    'segmento %s: todas as seções na ordem',
    (segmento) => {
      const m = montarConteudo(versaoDoModelo(segmento), BUFFET);
      expect(m.cabecalho.titulo).toBe('Proposta nº 0042 · versão 2');
      expect(m.cabecalho.validade).toBe('Válida até 15/10/2026');
      expect(m.cabecalho.emitidaEm).toBe('30/09/2026');
      expect(m.abertura).toMatch(
        /^Olá, Ana! Proposta para .+ em 14\/11\/2026, \d+ convidados no Buffet X\. \{xyz\}$/,
      );
      expect(m.evento.data).toBe('sábado, 14 de novembro de 2026');
      expect(m.evento.convidados[0]).toMatchObject({ rotulo: 'Adultos' });
      expect(m.investimento.linhas.length).toBeGreaterThan(0);
      expect(m.investimento.total).toMatch(/^R\$ /);
      expect(m.condicoes.sinal).toMatch(/\(30%\) para garantir a data$/);
      expect(m.condicoes.formasPagamento).toBe('Pix, Cartão de crédito e Boleto');
      expect(m.politicas).toEqual({
        cancelamento: TEXTOS.cancelamento,
        alteracaoConvidados: TEXTOS.alteracaoConvidados,
      });
      expect(m.incluso?.naoIncluso).toBe('Bebidas alcoólicas.');
      expect(m.observacoes).toBe('Decoração azul.');
      expect(m.rodape.linhas).toEqual([
        'Buffet X Festas Ltda',
        'CNPJ 11.222.333/0001-81',
        'Rua das Flores, 100 - Centro',
        'WhatsApp (34) 99135-5450',
      ]);
      expect(m.rodape.orkestra).toBe(true);
      expect(m.validade.expirada).toBe(false);
    },
  );

  it('espaço no local do cliente mostra o aviso de deslocamento', () => {
    const m = montarConteudo(versaoDoModelo('domicilio'), BUFFET);
    if (m.evento.espaco?.startsWith('No local do cliente')) {
      expect(m.evento.avisoDeslocamento).toMatch(/deslocamento/);
    }
  });

  it('o conteúdo congelado não muda quando o catálogo muda depois', () => {
    const v = versaoDoModelo('infantil');
    const antes = textoDoModelo(montarConteudo(v, BUFFET));
    // catálogo "muda": nada disso entra no modelo, que só lê a versão congelada
    const ctx = contextoDoModelo(MODELOS.infantil);
    ctx.pacotes[0]!.secoes = [];
    ctx.pacotes[0]!.nome = 'Outro nome';
    expect(textoDoModelo(montarConteudo(v, BUFFET))).toBe(antes);
  });

  it('versão antiga sem conteúdo congelado mostra resultado e itens, sem cardápio nem políticas', () => {
    const v = { ...versaoDoModelo('infantil'), conteudo: null, observacoes: null };
    const m = montarConteudo(v, {
      ...BUFFET,
      razaoSocial: null,
      cnpj: null,
      endereco: null,
      whatsappE164: null,
    });
    expect(m.cardapio).toBeNull();
    expect(m.politicas).toBeNull();
    expect(m.incluso).toBeNull();
    expect(m.abertura).toBeNull();
    expect(m.condicoes.sinal).toMatch(/^R\$ .+ para garantir a data$/);
    expect(m.evento.convidados).toEqual([{ rotulo: 'Convidados', quantidade: v.convidados }]);
    expect(m.rodape.linhas).toEqual(['Buffet X']);
  });

  it('proposta vencida', () => {
    const m = montarConteudo({ ...versaoDoModelo('infantil'), hoje: '2026-10-20' }, BUFFET);
    expect(m.validade).toMatchObject({ expirada: true, texto: 'Venceu em 15/10/2026' });
  });

  it('data por extenso', () => {
    expect(dataPorExtenso('2026-11-14')).toBe('sábado, 14 de novembro de 2026');
    expect(dataPorExtenso('2027-01-01')).toBe('sexta-feira, 1 de janeiro de 2027');
  });
});

describe('abertura, arquivo, diferenças, validade e temperatura', () => {
  it('preenche variáveis conhecidas e mantém as desconhecidas', () => {
    expect(
      preencherAbertura('Oi {nome}, {tipo} dia {data} ({convidados}) - {buffet} {outra}', {
        nome: 'Ana',
        tipo: 'aniversário',
        data: '14/11/2026',
        convidados: '60',
        buffet: 'Buffet X',
      }),
    ).toBe('Oi Ana, aniversário dia 14/11/2026 (60) - Buffet X {outra}');
    expect(preencherAbertura('Sem variáveis.', {})).toBe('Sem variáveis.');
    expect(preencherAbertura('  ', {})).toBeNull();
    expect(preencherAbertura(null, {})).toBeNull();
  });

  it('nome do arquivo do PDF', () => {
    expect(numeroProposta(42)).toBe('0042');
    expect(numeroProposta(12345)).toBe('12345');
    const a = arquivoProposta({ numero: 42, buffet: 'Buffet Ação', cliente: 'Ana Souza' });
    expect(a.nome).toBe('Proposta 0042 - Buffet Ação - Ana Souza.pdf');
    expect(a.contentDisposition).toBe(
      `attachment; filename="Proposta 0042 - Buffet Acao - Ana Souza.pdf"; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
    );
    expect(arquivoProposta({ numero: 7, buffet: 'A/B "C"', cliente: null }).nome).toBe(
      'Proposta 0007 - A B C.pdf',
    );
  });

  it('diferenças entre versões', () => {
    const base = {
      data: '2026-11-14',
      turno: 'Tarde',
      espaco: 'Salão',
      convidados: 50,
      pacote: 'Alegria',
      extras: ['Mesa temática'],
      totalCentavos: 450_000,
    };
    expect(diferencasEntreVersoes(base, base)).toEqual([]);
    expect(
      diferencasEntreVersoes(base, {
        ...base,
        data: '2026-11-21',
        convidados: 70,
        pacote: 'Super',
        extras: ['Pula-pula'],
        totalCentavos: 495_000,
      }),
    ).toEqual([
      'Data: 14/11/2026 → 21/11/2026',
      'Convidados: 50 → 70',
      'Pacote: Alegria → Super',
      'Extras incluídos: Pula-pula',
      'Extras retirados: Mesa temática',
      'Total: +R$ 450,00',
    ]);
    expect(diferencasEntreVersoes(base, { ...base, totalCentavos: 400_000 })).toEqual([
      'Total: -R$ 500,00',
    ]);
  });

  it('validade', () => {
    expect(estadoValidade('2026-10-03', '2026-09-30')).toEqual({
      expirada: false,
      dias: 3,
      texto: 'Vence em 3 dias',
    });
    expect(estadoValidade('2026-10-01', '2026-09-30').texto).toBe('Vence amanhã');
    expect(estadoValidade('2026-09-30', '2026-09-30').texto).toBe('Vence hoje');
    expect(estadoValidade('2026-09-29', '2026-09-30')).toMatchObject({
      expirada: true,
      texto: 'Venceu em 29/09/2026',
    });
  });

  it('temperatura: 2 aberturas em 3 dias = quente', () => {
    const agora = new Date('2026-10-01T12:00:00Z');
    const h = (horas: number) => new Date(agora.getTime() - horas * 3_600_000);
    expect(temperaturaPorAberturas([h(1)], agora, 'morno')).toBe('morno');
    expect(temperaturaPorAberturas([h(1), h(50)], agora, 'morno')).toBe('quente');
    expect(temperaturaPorAberturas([h(1), h(80)], agora, 'frio')).toBe('frio');
    expect(temperaturaPorAberturas([], agora, 'quente')).toBe('quente');
  });
});

describe('CNPJ', () => {
  it('valida dígitos e aplica máscara', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
    expect(cnpjValido('123')).toBe(false);
    expect(limparCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(mascaraCnpj('11222')).toBe('11.222');
    expect(mascaraCnpj('112223330001')).toBe('11.222.333/0001');
    expect(mascaraCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(mascaraCnpj('')).toBe('');
  });
});

describe('ids do modelo usados nos testes', () => {
  it('existem', () => {
    expect(idDoModelo.pacote('alegria')).toBe('pacote:alegria');
  });
});

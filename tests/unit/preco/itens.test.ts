import { describe, expect, it } from 'vitest';
import { calcularOrcamento, type ContextoPreco, type ModoVenda } from '@/domain/preco';
import { contextoBase, entradaSimples, opcional, SABADO } from './fixture';

/*
 * Orçamento por itens, sem pacote (§96): o cliente escolhe os itens; quantidade por convidado
 * escondida do cliente; item por pessoa com faixas; base da festa por faixa; mínimos.
 */

function contexto(modo: ModoVenda = 'itens', extra: Partial<ContextoPreco['regras']> = {}) {
  const c = contextoBase();
  c.regras = { ...c.regras, modoVenda: modo, ...extra };
  c.opcionais = [
    ...c.opcionais,
    opcional({
      id: 'it-salgados',
      nome: 'Salgados',
      cobranca: 'por_unidade',
      precoCentavos: 90,
      categoria: 'Salgados',
      qtdPorConvidadoCent: 1200,
      qtdMin: 1,
    }),
    opcional({
      id: 'it-massas',
      nome: 'Buffet de massas',
      cobranca: 'por_pessoa',
      precoCentavos: 3800,
      categoria: 'Pratos',
      faixasPorPessoa: [
        { ateConvidados: 90, valorCentavos: 4500 },
        { ateConvidados: 120, valorCentavos: 4000 },
      ],
    }),
    opcional({
      id: 'it-bolo',
      nome: 'Bolo de 3 kg',
      cobranca: 'fixo',
      precoCentavos: 25000,
      categoria: 'Bolos e tortas',
    }),
    opcional({
      id: 'it-so-pacote',
      nome: 'Upgrade do pacote',
      cobranca: 'fixo',
      precoCentavos: 10000,
      pacotesCompativeisIds: ['pac-super'],
    }),
  ];
  return c;
}

const semPacote = (opcionais: { opcionalId: string; quantidade: number }[], extra = {}) =>
  entradaSimples({ pacoteId: null, opcionais, ...extra });

describe('orçamento por itens', () => {
  it('soma os itens escolhidos, sem linha de pacote', () => {
    const r = calcularOrcamento(
      contexto(),
      semPacote([
        { opcionalId: 'it-salgados', quantidade: 1 },
        { opcionalId: 'it-bolo', quantidade: 1 },
      ]),
    );
    expect(r.erros).toEqual([]);
    expect(r.linhas.map((l) => l.tipo)).toEqual(['opcional', 'opcional']);
    // 40 convidados × 12 = 480 salgados × R$ 0,90 = R$ 432,00; bolo R$ 250,00
    expect(r.totalCentavos).toBe(43200 + 25000);
  });

  it('quantidade por convidado: calculada, arredondada para cima e marcada como conta do buffet', () => {
    const c = contexto();
    c.opcionais = c.opcionais.map((o) =>
      o.id === 'it-salgados' ? { ...o, qtdPorConvidadoCent: 1250 } : o,
    );
    const r = calcularOrcamento(c, semPacote([{ opcionalId: 'it-salgados', quantidade: 0 }]));
    const l = r.linhas[0]!;
    expect(r.erros).toEqual([]);
    expect(l.quantidade).toBe(500); // 40 × 12,5
    expect(l.ocultarConta).toBe(true);
    expect(l.detalhe).toBe('500 unidades (12,5 por convidado) × R$ 0,90');
    const r41 = calcularOrcamento(
      c,
      semPacote([{ opcionalId: 'it-salgados', quantidade: 0 }], { adultos: 41 }),
    );
    expect(r41.linhas[0]!.quantidade).toBe(513); // 512,5 → 513
  });

  it('item por pessoa usa a faixa de convidados; acima da maior, o preço base', () => {
    const preco = (adultos: number) =>
      calcularOrcamento(
        contexto(),
        semPacote([{ opcionalId: 'it-massas', quantidade: 1 }], { adultos }),
      ).linhas[0]!.valorUnitarioCentavos;
    expect(preco(40)).toBe(4500);
    expect(preco(90)).toBe(4500);
    expect(preco(91)).toBe(4000);
    expect(preco(130)).toBe(3800);
  });

  it('base da festa por pessoa pela faixa, mais os itens com preço', () => {
    const c = contexto('itens', {
      faixasFestaPorPessoa: [
        { ateConvidados: 90, valorCentavos: 4500 },
        { ateConvidados: 120, valorCentavos: 4000 },
      ],
    });
    const r = calcularOrcamento(c, semPacote([{ opcionalId: 'it-bolo', quantidade: 1 }]));
    expect(r.erros).toEqual([]);
    expect(r.linhas[0]).toMatchObject({
      tipo: 'festa',
      quantidade: 40,
      valorUnitarioCentavos: 4500,
      subtotalCentavos: 180000,
      detalhe: '40 convidados × R$ 45,00 por pessoa',
    });
    expect(r.totalCentavos).toBe(180000 + 25000);
    // com base da festa, o cliente pode só montar o cardápio (sem item com preço)
    expect(calcularOrcamento(c, semPacote([])).erros).toEqual([]);
    // acima da maior faixa, vale a maior
    const grande = calcularOrcamento(c, semPacote([], { adultos: 150 }));
    expect(grande.linhas[0]!.valorUnitarioCentavos).toBe(4000);
  });

  it('o ajuste do dia vale sobre a festa inteira', () => {
    const r = calcularOrcamento(
      contexto(),
      semPacote([{ opcionalId: 'it-bolo', quantidade: 1 }], { data: SABADO }),
    );
    expect(r.linhas.map((l) => l.tipo)).toEqual(['opcional', 'ajuste_dia']);
    const ajuste = r.linhas.find((l) => l.tipo === 'ajuste_dia')!;
    expect(ajuste.subtotalCentavos).toBe(2500); // +10% de R$ 250,00
    expect(ajuste.detalhe).toBe('+10% sobre a festa (R$ 250,00)');
  });

  it('sem nenhum item (e sem base da festa) pede ao menos um', () => {
    const r = calcularOrcamento(contexto(), semPacote([]));
    expect(r.erros.map((e) => e.codigo)).toEqual(['ITENS_OBRIGATORIOS']);
  });

  it('item ligado a pacotes não entra no orçamento sem pacote', () => {
    const r = calcularOrcamento(
      contexto(),
      semPacote([{ opcionalId: 'it-so-pacote', quantidade: 1 }]),
    );
    expect(r.erros.map((e) => e.codigo)).toEqual(['OPCIONAL_INCOMPATIVEL']);
  });

  it('modo só pacotes recusa orçamento sem pacote; ambos e itens aceitam', () => {
    const itens = [{ opcionalId: 'it-bolo', quantidade: 1 }];
    expect(calcularOrcamento(contexto('pacotes'), semPacote(itens)).erros[0]!.codigo).toBe(
      'PACOTE_OBRIGATORIO',
    );
    const c = contextoBase(); // sem modoVenda: o padrão é só pacotes
    c.opcionais.push(opcional({ id: 'it-x', nome: 'X', cobranca: 'fixo', precoCentavos: 100 }));
    expect(
      calcularOrcamento(c, semPacote([{ opcionalId: 'it-x', quantidade: 1 }])).erros[0]!.codigo,
    ).toBe('PACOTE_OBRIGATORIO');
    expect(calcularOrcamento(contexto('ambos'), semPacote(itens)).ok).toBe(true);
    // e com pacote continua igual no modo ambos
    expect(calcularOrcamento(contexto('ambos'), entradaSimples()).ok).toBe(true);
  });

  it('mínimo de convidados e pedido mínimo: erro no link, aviso no interno', () => {
    const c = contexto('itens', { minConvidadosItens: 50, pedidoMinimoCentavos: 150000 });
    const itens = [{ opcionalId: 'it-bolo', quantidade: 1 }];
    const publico = calcularOrcamento(c, semPacote(itens));
    expect(publico.erros.map((e) => e.codigo)).toEqual([
      'CONVIDADOS_ABAIXO_MINIMO',
      'PEDIDO_MINIMO',
    ]);
    expect(publico.erros[0]!.mensagem).toBe(
      'O orçamento montado por itens é a partir de 50 convidados.',
    );
    expect(publico.erros[1]!.mensagem).toBe(
      'O pedido mínimo é de R$ 1.500,00. Faltam R$ 1.250,00.',
    );
    const interno = calcularOrcamento(c, semPacote(itens, { canal: 'interno', adultos: 50 }));
    expect(interno.erros).toEqual([]);
    expect(interno.avisos.map((a) => a.codigo)).toEqual(['PEDIDO_MINIMO']);
    // com pacote, o pedido mínimo do orçamento por itens não vale
    const comPacote = calcularOrcamento(
      contexto('ambos', { pedidoMinimoCentavos: 99_999_999, minConvidadosItens: 500 }),
      entradaSimples(),
    );
    expect(comPacote.ok).toBe(true);
  });
});

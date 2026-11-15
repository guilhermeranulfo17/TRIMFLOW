import { describe, expect, it } from 'vitest';
import type { ContextoPreco, ModoVenda } from '@/domain/preco';
import {
  agruparPorCategoria,
  escolhasNoModo,
  itensSemPacote,
  montarPrevia,
  motivoDoBotaoDesabilitado,
  passoAnterior,
  passoPermitido,
  proximoPasso,
  tituloDoPasso,
  type Escolhas,
} from '@/domain/publico';
import { montarConteudo, type VersaoProposta } from '@/domain/proposta/conteudo';
import { contextoBase, HOJE, opcional } from '../preco/fixture';

/* Link público sem pacote (§96): escolhas no jeito de vender, passos e prévia dos itens. */

function contexto(modo: ModoVenda = 'itens'): ContextoPreco {
  const c = contextoBase();
  c.regras = { ...c.regras, modoVenda: modo };
  c.opcionais = [
    opcional({
      id: 'it-salgados',
      nome: 'Salgados',
      cobranca: 'por_unidade',
      precoCentavos: 90,
      categoria: 'Salgados',
      qtdPorConvidadoCent: 1200,
    }),
    opcional({
      id: 'it-bolo',
      nome: 'Bolo',
      cobranca: 'fixo',
      precoCentavos: 25000,
      categoria: 'Bolos',
    }),
    opcional({ id: 'it-garcom', nome: 'Garçom', cobranca: 'por_unidade', precoCentavos: 18000 }),
    opcional({
      id: 'it-do-pacote',
      nome: 'Upgrade',
      cobranca: 'fixo',
      precoCentavos: 100,
      pacotesCompativeisIds: ['pac-super'],
    }),
    opcional({
      id: 'it-casamento',
      nome: 'Valsa',
      cobranca: 'fixo',
      precoCentavos: 100,
      tiposEventoIds: ['te-casamento'],
    }),
  ];
  return c;
}

const festa: Escolhas = {
  tipoEventoId: 'te-infantil',
  data: '2026-11-11',
  turnoId: 'tu-tarde',
  espacoId: 'esp-salao',
  adultos: 50,
  criancas: [],
  opcionais: [],
  horasExtras: 0,
};

describe('escolhasNoModo', () => {
  it('só itens: sempre sem pacote (e sem nada do pacote)', () => {
    const e = escolhasNoModo('itens', {
      ...festa,
      pacoteId: 'pac-super',
      retirados: ['x'],
      horasExtras: 2,
    });
    expect(e.semPacote).toBe(true);
    expect(e.pacoteId).toBeUndefined();
    expect(e.retirados).toBeUndefined();
    expect(e.horasExtras).toBe(0);
  });

  it('só pacotes desliga o sem pacote; os dois respeita o cliente', () => {
    expect(escolhasNoModo('pacotes', { ...festa, semPacote: true }).semPacote).toBeUndefined();
    expect(escolhasNoModo(undefined, { ...festa, semPacote: true }).semPacote).toBeUndefined();
    expect(escolhasNoModo('ambos', { ...festa, semPacote: true }).semPacote).toBe(true);
  });
});

describe('itens do orçamento sem pacote', () => {
  it('só itens ativos do tipo de festa e que não são complemento de pacote', () => {
    // na ordem do catálogo (aqui, a de cadastro: todos com ordem 0)
    expect(itensSemPacote(contexto(), 'te-infantil').map((o) => o.id)).toEqual([
      'it-salgados',
      'it-bolo',
      'it-garcom',
    ]);
    expect(itensSemPacote(contexto(), undefined)).toEqual([]);
  });

  it('agrupa por categoria, com "Outros" no fim', () => {
    const grupos = agruparPorCategoria(itensSemPacote(contexto(), 'te-infantil'));
    expect(grupos.map((g) => g.categoria)).toEqual(['Salgados', 'Bolos', 'Outros']);
  });
});

describe('prévia sem pacote', () => {
  const previa = (e: Escolhas, comContato = true) =>
    montarPrevia(contexto(), e, { hoje: HOJE, comContato, modo: 'exato' });

  it('antes do WhatsApp, nenhum item nem preço', () => {
    const p = previa({ ...festa, semPacote: true }, false);
    expect(p.itens).toEqual([]);
    expect(p.resultado).toBeNull();
  });

  it('depois do WhatsApp: valor de cada item para a festa e o total', () => {
    const p = previa({
      ...festa,
      semPacote: true,
      opcionais: [
        { opcionalId: 'it-salgados', quantidade: 1 },
        { opcionalId: 'it-garcom', quantidade: 2 },
      ],
    });
    const porId = Object.fromEntries(p.itens.map((i) => [i.id, i]));
    // 50 convidados × 12 × R$ 0,90: o cliente vê o valor, não a conta
    expect(porId['it-salgados']).toMatchObject({
      valorCentavos: 54000,
      automatica: true,
      porUnidade: false,
    });
    expect(porId['it-garcom']).toMatchObject({ valorCentavos: 18000, porUnidade: true });
    expect(p.totalCentavos).toBe(54000 + 36000);
    expect(p.erroSemPacote).toBeNull();
  });

  it('abaixo do pedido mínimo: mostra o total parcial e o que falta; sem "a partir de"', () => {
    const c = contexto();
    c.regras = { ...c.regras, pedidoMinimoCentavos: 100000 };
    const p = montarPrevia(
      c,
      { ...festa, semPacote: true, opcionais: [{ opcionalId: 'it-bolo', quantidade: 1 }] },
      { hoje: HOJE, comContato: true, modo: 'exato' },
    );
    expect(p.totalCentavos).toBe(25000);
    expect(p.aPartirDeCentavos).toBeNull();
    expect(p.erroSemPacote).toBe('O pedido mínimo é de R$ 1.000,00. Faltam R$ 750,00.');
  });

  it('sem item: o erro aparece para o passo', () => {
    const p = previa({ ...festa, semPacote: true });
    expect(p.erroSemPacote).toBe('Escolha pelo menos um item para a sua festa.');
  });
});

describe('passos sem pacote', () => {
  const dados = { tiposEvento: [{ id: 'te-infantil' }], turnos: [], espacos: [] };

  it('o passo 4 vira "Monte sua festa" e pula os extras', () => {
    expect(tituloDoPasso(4, { semPacote: true }).titulo).toBe('Monte sua festa');
    expect(tituloDoPasso(4, {}).titulo).toBe('Escolha o pacote');
    expect(proximoPasso(4, true)).toBe(6);
    expect(proximoPasso(4, false)).toBe(5);
    expect(passoAnterior(6, false, true)).toBe(4);
  });

  it('o botão pede um item (ou aceita a festa com preço base) e mostra o erro do motor', () => {
    const e = { ...festa, semPacote: true };
    expect(motivoDoBotaoDesabilitado(4, e, dados)).toBe(
      'Escolha pelo menos um item para a sua festa.',
    );
    expect(motivoDoBotaoDesabilitado(4, e, { ...dados, festaComPreco: true })).toBeNull();
    const comItem = { ...e, opcionais: [{ opcionalId: 'it-bolo', quantidade: 1 }] };
    expect(
      motivoDoBotaoDesabilitado(4, comItem, { ...dados, erroSemPacote: 'Faltam R$ 10,00.' }),
    ).toBe('Faltam R$ 10,00.');
  });

  it('sem pacote, pedir o passo 5 cai no 4', () => {
    const e = { ...festa, semPacote: true, opcionais: [{ opcionalId: 'it-bolo', quantidade: 1 }] };
    const d = {
      tiposEvento: [{ id: 'te-infantil' }],
      turnos: [{ id: 'tu-tarde', diasSemana: [0, 1, 2, 3, 4, 5, 6] }],
      espacos: [{ id: 'esp-salao', nome: 'Salão', capacidadeMax: 120, noLocalDoCliente: false }],
    };
    expect(passoPermitido(5, e, d, { temToken: true })).toBe(4);
  });
});

describe('proposta: a conta do item por convidado é do buffet', () => {
  it('a linha marcada sai sem o detalhe; as outras continuam', () => {
    const p = montarPrevia(
      contexto(),
      {
        ...festa,
        semPacote: true,
        opcionais: [
          { opcionalId: 'it-salgados', quantidade: 1 },
          { opcionalId: 'it-bolo', quantidade: 1 },
        ],
      },
      { hoje: HOJE, comContato: true, modo: 'exato' },
    );
    const r = p.resultado!;
    const v: VersaoProposta = {
      numero: 1,
      versao: 1,
      status: 'enviado',
      emitidaEm: null,
      validadeAte: '2026-10-15',
      hoje: HOJE,
      resultado: r,
      conteudo: null,
      itens: r.linhas.map((l) => ({
        tipo: l.tipo,
        descricao: l.descricao,
        quantidade: l.quantidade,
        subtotalCentavos: l.subtotalCentavos,
        detalhe: l.detalhe,
      })),
      totalCentavos: r.totalCentavos,
      data: festa.data!,
      convidados: 50,
      tipoEvento: 'Aniversário infantil',
      turno: null,
      espaco: 'Salão',
      clienteNome: 'Ana',
      observacoes: null,
    };
    const m = montarConteudo(v, {
      nome: 'Buffet',
      logoUrl: null,
      corMarca: null,
      razaoSocial: null,
      cnpj: null,
      endereco: null,
      whatsappE164: null,
      rodapeOrkestra: true,
      modeloVisual: 'elegante',
    });
    const linha = (d: string) => m.investimento.linhas.find((l) => l.descricao === d)!;
    expect(linha('Salgados').detalhe).toBeNull();
    expect(linha('Salgados').valor).toBe('R$ 540,00');
    expect(linha('Bolo').detalhe).toBe('Valor fixo');
  });
});

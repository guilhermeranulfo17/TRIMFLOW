import { describe, expect, it } from 'vitest';
import {
  validarFaixasDeslocamento,
  validarFaixasIdade,
  validarFaixasPreco,
  validarPrecoPacote,
  validarTurno,
  validarVinculosOpcional,
} from '@/domain/catalogo/validacoes';

const campos = (problemas: { campo: string }[]) => problemas.map((p) => p.campo);

describe('faixas de preço', () => {
  it('válidas quando crescentes', () => {
    expect(
      validarFaixasPreco([
        { ateConvidados: 30, valorCentavos: 1 },
        { ateConvidados: 50, valorCentavos: 2 },
      ]),
    ).toEqual([]);
  });

  it('exige ao menos uma', () => {
    expect(validarFaixasPreco([])[0]?.mensagem).toBe(
      'Cadastre pelo menos uma faixa de convidados.',
    );
  });

  it('recusa repetição e ordem decrescente', () => {
    const r = validarFaixasPreco([
      { ateConvidados: 50, valorCentavos: 1 },
      { ateConvidados: 50, valorCentavos: 2 },
      { ateConvidados: 30, valorCentavos: 3 },
    ]);
    expect(r.map((p) => p.mensagem)).toEqual([
      'Faixa repetida.',
      'As faixas precisam estar em ordem crescente de convidados.',
    ]);
    expect(campos(r)).toEqual(['faixas.1.ateConvidados', 'faixas.2.ateConvidados']);
  });
});

describe('preço do pacote', () => {
  const base = {
    modeloPreco: 'por_pessoa' as const,
    precoPessoaCentavos: 12000,
    valorExcedenteCentavos: null,
    faixas: [],
    minConvidados: 30,
    maxConvidados: 200,
  };

  it('por pessoa válido', () => {
    expect(validarPrecoPacote(base)).toEqual([]);
  });

  it('por pessoa exige o preço', () => {
    expect(campos(validarPrecoPacote({ ...base, precoPessoaCentavos: null }))).toEqual([
      'precoPessoaCentavos',
    ]);
  });

  it('por faixa exige faixas e excedente', () => {
    expect(campos(validarPrecoPacote({ ...base, modeloPreco: 'por_faixa' }))).toEqual([
      'faixas',
      'valorExcedenteCentavos',
    ]);
  });

  it('máximo menor que o mínimo', () => {
    expect(campos(validarPrecoPacote({ ...base, maxConvidados: 10 }))).toEqual(['maxConvidados']);
  });
});

describe('faixas de idade', () => {
  const f = (idadeMin: number, idadeMax: number | null) => ({
    rotulo: 'x',
    idadeMin,
    idadeMax,
    fatorBp: 0,
  });

  it('válidas: 0-5, 6-10, 11+ (em qualquer ordem)', () => {
    expect(validarFaixasIdade([f(11, null), f(0, 5), f(6, 10)])).toEqual([]);
  });

  it('lista vazia é válida', () => {
    expect(validarFaixasIdade([])).toEqual([]);
  });

  it.each([
    ['não começa em 0', [f(2, 5)], 'A primeira faixa precisa começar em 0 ano.'],
    ['buraco entre faixas', [f(0, 5), f(8, null)], 'Falta cobrir de 6 a 7 anos.'],
    ['sobreposição', [f(0, 5), f(5, 10)], 'Essa faixa se sobrepõe à anterior.'],
    ['aberta no meio', [f(0, null), f(6, 10)], 'Só a última faixa pode ficar sem idade máxima.'],
    ['máxima menor que mínima', [f(0, 5), f(6, 3)], 'A idade máxima é menor que a mínima.'],
  ])('%s', (_n, faixas, mensagem) => {
    expect(validarFaixasIdade(faixas).map((p) => p.mensagem)).toContain(mensagem);
  });
});

describe('faixas de deslocamento', () => {
  it('crescentes são válidas', () => {
    expect(
      validarFaixasDeslocamento([
        { ateKm: 10, valorCentavos: 1 },
        { ateKm: 30, valorCentavos: 2 },
      ]),
    ).toEqual([]);
  });

  it('recusa repetição e ordem decrescente', () => {
    expect(
      campos(
        validarFaixasDeslocamento([
          { ateKm: 30, valorCentavos: 1 },
          { ateKm: 30, valorCentavos: 2 },
          { ateKm: 10, valorCentavos: 3 },
        ]),
      ),
    ).toEqual(['faixas.1.ateKm', 'faixas.2.ateKm']);
  });
});

describe('turno e vínculos de opcional', () => {
  it('turno precisa de duração e dia', () => {
    expect(validarTurno({ duracaoMin: 240, diasSemana: [6] })).toEqual([]);
    expect(campos(validarTurno({ duracaoMin: 0, diasSemana: [] }))).toEqual([
      'duracaoMin',
      'diasSemana',
    ]);
  });

  it('opcional não pode ser compatível e incluso no mesmo pacote', () => {
    expect(validarVinculosOpcional({ compativeis: ['a'], inclusos: ['b'] })).toEqual([]);
    expect(validarVinculosOpcional({ compativeis: ['a', 'b'], inclusos: ['b'] })).toHaveLength(1);
  });
});

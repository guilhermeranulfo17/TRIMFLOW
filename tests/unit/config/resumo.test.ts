import { describe, expect, it } from 'vitest';
import { resumirPrecoOpcional, resumirPrecoPacote } from '@/domain/catalogo/resumo';

const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('resumirPrecoPacote', () => {
  it('por pessoa', () => {
    expect(
      nbsp(
        resumirPrecoPacote({
          modeloPreco: 'por_pessoa',
          precoPessoaCentavos: 8990,
          valorExcedenteCentavos: null,
          faixas: [],
        }),
      ),
    ).toBe('R$ 89,90 por convidado');
  });

  it('por faixa mostra a menor faixa', () => {
    expect(
      nbsp(
        resumirPrecoPacote({
          modeloPreco: 'por_faixa',
          precoPessoaCentavos: null,
          valorExcedenteCentavos: 6000,
          faixas: [
            { ateConvidados: 80, valorCentavos: 450000 },
            { ateConvidados: 50, valorCentavos: 350000 },
          ],
        }),
      ),
    ).toBe('R$ 3.500,00 até 50 convidados');
  });

  it('sem preço quando falta valor ou faixa', () => {
    const base = { precoPessoaCentavos: null, valorExcedenteCentavos: null, faixas: [] };
    expect(resumirPrecoPacote({ ...base, modeloPreco: 'por_pessoa' })).toBe('Sem preço');
    expect(
      resumirPrecoPacote({ ...base, modeloPreco: 'por_faixa', valorExcedenteCentavos: 0 }),
    ).toBe('Sem preço');
  });
});

describe('resumirPrecoOpcional', () => {
  it.each([
    ['por_pessoa', 'R$ 12,00 por convidado'],
    ['por_unidade', 'R$ 12,00 por unidade'],
    ['por_hora', 'R$ 12,00 por hora'],
    ['fixo', 'R$ 12,00 (valor fixo)'],
  ] as const)('%s', (cobranca, esperado) => {
    expect(nbsp(resumirPrecoOpcional({ cobranca, precoCentavos: 1200 }))).toBe(esperado);
  });
});

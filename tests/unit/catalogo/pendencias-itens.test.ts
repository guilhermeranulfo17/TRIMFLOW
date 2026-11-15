import { describe, expect, it } from 'vitest';
import { pendenciasDoLinkPublico, type ResumoCatalogo } from '@/domain/catalogo/pendencias';

const base = (venda?: ResumoCatalogo['venda'], comPacote = false): ResumoCatalogo => ({
  pacotes: comPacote
    ? [
        {
          ativo: true,
          modeloPreco: 'por_pessoa',
          precoPessoaCentavos: 9000,
          valorExcedenteCentavos: null,
          quantidadeFaixas: 0,
          precoConfirmado: true,
        },
      ]
    : [],
  tiposEvento: [{ ativo: true }],
  turnos: [{ ativo: true }],
  espacos: [{ ativo: true }],
  ...(venda ? { venda } : {}),
});
const codigos = (r: ResumoCatalogo) => pendenciasDoLinkPublico(r).map((p) => p.codigo);
const v = (modo: 'pacotes' | 'itens' | 'ambos', itensComPreco = false, festaComPreco = false) => ({
  modo,
  itensComPreco,
  festaComPreco,
});

describe('pendências do link conforme o jeito de vender (§96)', () => {
  it('sem a informação de venda (banco anterior), vale só pacotes', () => {
    expect(codigos(base())).toEqual(['SEM_PACOTE_COM_PRECO']);
    expect(codigos(base(undefined, true))).toEqual([]);
  });

  it('só itens: precisa de item vendável sem pacote ou do preço da festa', () => {
    expect(codigos(base(v('itens'), true))).toEqual(['SEM_ITEM_COM_PRECO']);
    expect(codigos(base(v('itens', true)))).toEqual([]);
    expect(codigos(base(v('itens', false, true)))).toEqual([]);
  });

  it('os dois: basta um dos jeitos funcionar', () => {
    expect(codigos(base(v('ambos')))).toEqual(['SEM_PACOTE_COM_PRECO']);
    expect(codigos(base(v('ambos'), true))).toEqual([]);
    expect(codigos(base(v('ambos', true)))).toEqual([]);
  });

  it('só pacotes ignora os itens', () => {
    expect(codigos(base(v('pacotes', true, true)))).toEqual(['SEM_PACOTE_COM_PRECO']);
  });
});

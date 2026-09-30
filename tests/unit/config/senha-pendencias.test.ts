import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  pacoteTemPreco,
  pendenciasDoLinkPublico,
  type ResumoCatalogo,
} from '@/domain/catalogo/pendencias';
import {
  gerarSenhaTemporaria,
  senhaTemporariaValida,
  TAMANHO_SENHA_TEMPORARIA,
} from '@/domain/senha';

describe('senha temporária', () => {
  it('tem 12 caracteres legíveis com minúscula, maiúscula e dígito', () => {
    for (let i = 0; i < 200; i++) {
      const senha = gerarSenhaTemporaria(randomInt);
      expect(senha).toHaveLength(TAMANHO_SENHA_TEMPORARIA);
      expect(senhaTemporariaValida(senha)).toBe(true);
      expect(senha).not.toMatch(/[0O1lI]/);
    }
  });

  it('é determinística com a mesma fonte de aleatoriedade', () => {
    const fonte = () => {
      let n = 0;
      return (max: number) => n++ % max;
    };
    expect(gerarSenhaTemporaria(fonte())).toBe(gerarSenhaTemporaria(fonte()));
  });

  it('recusa senhas fora do padrão', () => {
    expect(senhaTemporariaValida('abc')).toBe(false);
    expect(senhaTemporariaValida('abcdefghjkmn')).toBe(false); // sem maiúscula e dígito
    expect(senhaTemporariaValida('Abcdefghjk0m')).toBe(false); // caractere ambíguo
  });
});

describe('pendências do link público', () => {
  const completo: ResumoCatalogo = {
    pacotes: [
      {
        ativo: true,
        modeloPreco: 'por_pessoa',
        precoPessoaCentavos: 100,
        valorExcedenteCentavos: null,
        quantidadeFaixas: 0,
      },
    ],
    turnos: [{ ativo: true }],
    espacos: [{ ativo: true }],
  };

  it('nada pendente com catálogo completo', () => {
    expect(pendenciasDoLinkPublico(completo)).toEqual([]);
  });

  it('catálogo vazio acusa as três pendências', () => {
    expect(
      pendenciasDoLinkPublico({ pacotes: [], turnos: [], espacos: [] }).map((p) => p.codigo),
    ).toEqual(['SEM_PACOTE_COM_PRECO', 'SEM_TURNO_ATIVO', 'SEM_ESPACO_ATIVO']);
  });

  it('pacotes inativos ou sem preço não contam', () => {
    const r = pendenciasDoLinkPublico({
      ...completo,
      pacotes: [
        {
          ativo: false,
          modeloPreco: 'por_pessoa',
          precoPessoaCentavos: 100,
          valorExcedenteCentavos: null,
          quantidadeFaixas: 0,
        },
        {
          ativo: true,
          modeloPreco: 'por_faixa',
          precoPessoaCentavos: null,
          valorExcedenteCentavos: 100,
          quantidadeFaixas: 0,
        },
      ],
    });
    expect(r.map((p) => p.codigo)).toEqual(['SEM_PACOTE_COM_PRECO']);
    expect(r[0]?.secao).toBe('catalogo');
  });

  it('turno e espaço inativos contam como ausentes', () => {
    const r = pendenciasDoLinkPublico({
      ...completo,
      turnos: [{ ativo: false }],
      espacos: [{ ativo: false }],
    });
    expect(r.map((p) => p.codigo)).toEqual(['SEM_TURNO_ATIVO', 'SEM_ESPACO_ATIVO']);
  });

  it('pacote por faixa com preço', () => {
    expect(
      pacoteTemPreco({
        ativo: true,
        modeloPreco: 'por_faixa',
        precoPessoaCentavos: null,
        valorExcedenteCentavos: 100,
        quantidadeFaixas: 2,
      }),
    ).toBe(true);
  });
});

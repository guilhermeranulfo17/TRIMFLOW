import { describe, expect, it } from 'vitest';
import {
  estadoDaVersao,
  orcamentoInternoSchema,
  previaInternaSchema,
} from '@/domain/validacao/orcamento-interno';

const ID = '00000000-0000-4000-8000-000000000001';

describe('orçamento interno: schema', () => {
  const valido = {
    cliente: { whatsapp: '(34) 99135-5450', nome: 'Ana Souza' },
    escolhas: { tipoEventoId: ID, data: '2026-11-14' },
    ajustes: {
      avulsos: [{ descricao: 'Mesa extra', quantidade: 2, valorUnitarioCentavos: 15000 }],
      desconto: { tipo: 'percentual', bp: 500 },
    },
  };

  it('aceita o orçamento e preenche os padrões', () => {
    const r = orcamentoInternoSchema.parse(valido);
    expect(r.cliente.origem).toBe('whatsapp');
    expect(r.ajustes.foraAntecedencia).toBe(false);
    expect(r.ajustes.observacoesInternas).toBe('');
    expect(r.escolhas.opcionais).toEqual([]);
  });

  it('recusa nome curto, avulso sem descrição, desconto acima de 100% e valor negativo', () => {
    expect(
      orcamentoInternoSchema.safeParse({ ...valido, cliente: { whatsapp: '1', nome: 'A' } })
        .success,
    ).toBe(false);
    for (const ajustes of [
      { avulsos: [{ descricao: ' ', quantidade: 1, valorUnitarioCentavos: 1 }] },
      { desconto: { tipo: 'percentual', bp: 10_001 } },
      { desconto: { tipo: 'valor', centavos: -1 } },
      { desconto: { tipo: 'valor', centavos: 10.5 } },
    ]) {
      expect(orcamentoInternoSchema.safeParse({ ...valido, ajustes }).success).toBe(false);
    }
  });

  it('a prévia não exige o cliente', () => {
    expect(previaInternaSchema.safeParse({ escolhas: {}, ajustes: {} }).success).toBe(true);
  });
});

describe('orçamento interno: estado a partir da versão gravada', () => {
  it('rascunho interno: escolhas e ajustes; colunas valem mais', () => {
    const e = estadoDaVersao(
      {
        tipoEventoId: ID,
        adultos: 40,
        interno: { desconto: { tipo: 'valor', centavos: 5000 }, observacoes: 'antiga' },
      },
      {
        observacoes: 'Decoração inclusa',
        observacoesInternas: 'cliente antigo',
        foraAntecedencia: true,
      },
    );
    expect(e.escolhas.adultos).toBe(40);
    expect(e.ajustes.desconto).toEqual({ tipo: 'valor', centavos: 5000 });
    expect(e.ajustes.observacoes).toBe('Decoração inclusa');
    expect(e.ajustes.observacoesInternas).toBe('cliente antigo');
    expect(e.ajustes.foraAntecedencia).toBe(true);
  });

  it('rascunho do link (sem ajustes) e lixo viram formulário válido', () => {
    expect(estadoDaVersao({ tipoEventoId: ID }).ajustes.desconto).toBeNull();
    const vazio = estadoDaVersao('lixo');
    expect(vazio.escolhas).toEqual({ criancas: [], opcionais: [], horasExtras: 0 });
    expect(estadoDaVersao({ adultos: -3 }).escolhas.adultos).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import {
  compararPacotes,
  completarComPrevisto,
  margemBp,
  pendenciasDaFesta,
  previsaoDaFesta,
  resumoMargem,
} from '@/domain/modulos';

describe('OrkMargem', () => {
  it('copia a previsão do pacote para os convidados da festa', () => {
    const itens = previsaoDaFesta(
      [
        { categoria: 'alimentacao', fixoCentavos: 0, porConvidadoCentavos: 3500 },
        { categoria: 'equipe', fixoCentavos: 80000, porConvidadoCentavos: 0 },
        { categoria: 'bebidas', fixoCentavos: 0, porConvidadoCentavos: 0 },
      ],
      60,
    );
    expect(itens).toEqual([
      {
        categoria: 'alimentacao',
        descricao: 'Alimentação',
        previstoCentavos: 210000,
        realizadoCentavos: null,
      },
      {
        categoria: 'equipe',
        descricao: 'Equipe',
        previstoCentavos: 80000,
        realizadoCentavos: null,
      },
    ]);
  });

  it('separa receita contratada, recebido, previsto e realizado; margem realizada só completa', () => {
    const itens = [
      {
        categoria: 'alimentacao' as const,
        descricao: 'Alimentação',
        previstoCentavos: 210000,
        realizadoCentavos: 230000,
      },
      {
        categoria: 'equipe' as const,
        descricao: 'Equipe',
        previstoCentavos: 80000,
        realizadoCentavos: null,
      },
    ];
    const parcial = resumoMargem({
      receitaContratadaCentavos: 775000,
      recebidoCentavos: 232500,
      itens,
    });
    expect(parcial).toMatchObject({
      aReceberCentavos: 542500,
      custoPrevistoCentavos: 290000,
      custoRealizadoCentavos: 230000,
      itensSemRealizado: 1,
      margemPrevistaCentavos: 485000,
      margemRealizadaCentavos: null,
      diferencaCustoCentavos: null,
    });
    const completo = resumoMargem({
      receitaContratadaCentavos: 775000,
      recebidoCentavos: 775000,
      itens: completarComPrevisto(itens),
    });
    expect(completo).toMatchObject({
      aReceberCentavos: 0,
      custoRealizadoCentavos: 310000,
      margemRealizadaCentavos: 465000,
      margemRealizadaBp: 6000,
      diferencaCustoCentavos: 20000,
    });
  });

  it('margem em bp arredonda meio para cima e aceita prejuízo', () => {
    expect(margemBp(1, 3)).toBe(3333);
    expect(margemBp(-50, 100)).toBe(-5000);
    expect(margemBp(10, 0)).toBeNull();
  });

  it('pendências de preenchimento', () => {
    expect(
      pendenciasDaFesta({
        itens: [],
        receitaContratadaCentavos: 0,
        festaPassou: false,
        fechada: false,
      }),
    ).toEqual(['sem_previsao', 'sem_receita']);
    expect(
      pendenciasDaFesta({
        itens: [
          {
            categoria: 'taxas',
            descricao: 'Taxas',
            previstoCentavos: 100,
            realizadoCentavos: null,
          },
        ],
        receitaContratadaCentavos: 1000,
        festaPassou: true,
        fechada: false,
      }),
    ).toEqual(['custos_sem_realizado', 'festa_sem_fechamento']);
  });

  it('compara pacotes; realizada só com festas completas', () => {
    const r = compararPacotes([
      {
        pacote: 'Super',
        receitaContratadaCentavos: 100000,
        custoPrevistoCentavos: 40000,
        custoRealizadoCentavos: 50000,
      },
      {
        pacote: 'Super',
        receitaContratadaCentavos: 100000,
        custoPrevistoCentavos: 40000,
        custoRealizadoCentavos: null,
      },
      {
        pacote: null,
        receitaContratadaCentavos: 50000,
        custoPrevistoCentavos: 10000,
        custoRealizadoCentavos: null,
      },
    ]);
    expect(r[0]).toMatchObject({
      pacote: 'Super',
      festas: 2,
      margemPrevistaBp: 6000,
      festasRealizadas: 1,
      margemRealizadaBp: 5000,
    });
    expect(r[1]).toMatchObject({ pacote: 'Sem pacote', margemRealizadaBp: null });
  });
});

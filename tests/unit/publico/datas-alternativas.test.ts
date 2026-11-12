import { describe, expect, it } from 'vitest';
import {
  datasAlternativasDoRascunho,
  limparDatasAlternativas,
  textoDatasAlternativas,
} from '@/domain/publico/datas-alternativas';
import { escolhasSchema } from '@/domain/validacao/publico';

describe('datas de preferência do cliente', () => {
  it('no máximo 2 alternativas, sem repetir, sem a principal e sem lixo', () => {
    expect(
      limparDatasAlternativas('2027-05-15', [
        '2027-05-15',
        '2027-05-22',
        '',
        'ontem',
        '2027-05-22',
        '2027-02-30',
        '2027-05-29',
        '2027-06-05',
      ]),
    ).toEqual(['2027-05-22', '2027-05-29']);
  });

  it('respeita a data mínima (antecedência)', () => {
    expect(
      limparDatasAlternativas('2027-05-15', ['2026-11-13', '2027-01-10'], '2026-12-01'),
    ).toEqual(['2027-01-10']);
  });

  it('lê do rascunho do orçamento de qualquer forma, sem quebrar', () => {
    expect(
      datasAlternativasDoRascunho({ data: '2027-05-15', datasAlternativas: ['2027-05-22'] }),
    ).toEqual(['2027-05-22']);
    expect(datasAlternativasDoRascunho({ data: '2027-05-15' })).toEqual([]);
    expect(datasAlternativasDoRascunho(null)).toEqual([]);
    expect(datasAlternativasDoRascunho({ datasAlternativas: 'x' })).toEqual([]);
  });

  it('texto para o buffet', () => {
    expect(textoDatasAlternativas([])).toBeNull();
    expect(textoDatasAlternativas(['2027-05-22'])).toBe('Outras datas possíveis: 22/05/2027');
    expect(textoDatasAlternativas(['2027-05-22', '2027-05-29'])).toBe(
      'Outras datas possíveis: 22/05/2027 e 29/05/2027',
    );
  });

  it('o schema das escolhas aceita até 2 alternativas', () => {
    expect(escolhasSchema.safeParse({ datasAlternativas: ['2027-05-22'] }).success).toBe(true);
    expect(escolhasSchema.safeParse({}).success).toBe(true);
    expect(
      escolhasSchema.safeParse({ datasAlternativas: ['2027-05-22', '2027-05-23', '2027-05-24'] })
        .success,
    ).toBe(false);
  });
});

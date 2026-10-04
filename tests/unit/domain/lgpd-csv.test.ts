import { describe, expect, it } from 'vitest';
import { dataDaVersao, precisaAceitarTermos, VERSAO_DOCUMENTOS } from '@/domain/legal/versao';
import { arquivoCsv, colunasDe, csvDoLead, tabelaCsv } from '@/domain/lgpd/csv';

describe('CSV da LGPD', () => {
  it('separa com ";", escapa aspas, quebras e o próprio separador', () => {
    const csv = tabelaCsv([{ nome: 'Ana "Bia"', obs: 'a;b\nc', n: 3, nada: null }]);
    expect(csv).toBe('nome;obs;n;nada\r\n"Ana ""Bia""";"a;b\nc";3;');
  });

  it('fórmula vira texto (injeção de CSV) e objeto vira JSON', () => {
    const csv = tabelaCsv([{ a: '=HYPERLINK("x")', b: { x: 1 }, c: -5, d: '-5' }]);
    expect(csv.split('\r\n')[1]).toBe(`"'=HYPERLINK(""x"")";"{""x"":1}";-5;'-5`);
  });

  it('arquivo com BOM e colunas de todas as linhas', () => {
    expect(arquivoCsv([{ a: 1 }]).startsWith('﻿a\r\n1')).toBe(true);
    expect(colunasDe([{ a: 1 }, { b: 2, a: 3 }])).toEqual(['a', 'b']);
  });

  it('lead em seções, com "(nenhum)" nas vazias', () => {
    const csv = csvDoLead({
      lead: { nome: 'Titular', origem: 'instagram' },
      orcamentos: [{ numero: 1, total_centavos: 1000 }],
      reservas: [],
    });
    expect(csv).toContain('# Dados do lead\r\nnome;origem\r\nTitular;instagram');
    expect(csv).toContain('# Orçamentos\r\nnumero;total_centavos\r\n1;1000');
    expect(csv).toContain('# Reservas\r\n(nenhum)');
    expect(csv).toContain('# Tarefas\r\n(nenhum)');
  });
});

describe('aceite dos termos', () => {
  it('só o dono, e só quando a versão aceita é outra', () => {
    expect(precisaAceitarTermos('dono', null)).toBe(true);
    expect(precisaAceitarTermos('dono', '2020-01-01')).toBe(true);
    expect(precisaAceitarTermos('dono', VERSAO_DOCUMENTOS)).toBe(false);
    expect(precisaAceitarTermos('vendedor', null)).toBe(false);
  });

  it('data da versão em pt-BR', () => {
    expect(dataDaVersao('2026-10-04')).toBe('4/10/2026');
    expect(dataDaVersao('2026-11-20.2')).toBe('20/11/2026');
  });
});

describe('seed', () => {
  it('os usuários do seed aceitaram a versão vigente (senão todo E2E cai na tela de aceite)', async () => {
    const { readFileSync } = await import('node:fs');
    const seed = readFileSync('supabase/seed.sql', 'utf8');
    expect(seed).toContain(`termos_versao = '${VERSAO_DOCUMENTOS}'`);
  });
});

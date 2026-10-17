import { describe, expect, it } from 'vitest';
import { lerCsvLeads, separarCsv } from '@/domain/vendas/csv';

describe('CSV de leads de vendas', () => {
  it('separa com ponto e vírgula, aspas, aspas duplas e quebra de linha dentro de aspas', () => {
    const t = '﻿nome;resumo\r\n"Ana";"disse ""oi""\nontem"\r\nBia;ok\r\n\r\n';
    expect(separarCsv(t)).toEqual([
      ['nome', 'resumo'],
      ['Ana', 'disse "oi"\nontem'],
      ['Bia', 'ok'],
    ]);
  });

  it('detecta vírgula quando o cabeçalho usa vírgula', () => {
    expect(separarCsv('nome,cidade\nAna,Uberaba')).toEqual([
      ['nome', 'cidade'],
      ['Ana', 'Uberaba'],
    ]);
  });

  it('reconhece colunas por sinônimo e sem acento, em qualquer ordem', () => {
    const r = lerCsvLeads(
      'WhatsApp;Responsável;Empresa;Município;Observação\n34991355450;Ana;Buffet Sol;Uberaba;quer demo',
    );
    expect(r.ok && r.linhas[0]).toEqual({
      linha: 2,
      situacao: 'ok',
      dados: {
        nome: 'Ana',
        buffet: 'Buffet Sol',
        telefone: '+5534991355450',
        cidade: 'Uberaba',
        origem: null,
        resumo: 'quer demo',
        proximoFollowup: null,
        naoContatar: false,
      },
    });
  });

  it('marca inválidas com o motivo e repetidas dentro do arquivo', () => {
    const r = lerCsvLeads(
      'nome;telefone\nAna;(34) 99135-5450\n;34991355451\nBia;123\nCarla;34 99135-5450\nDani;',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas.map((l) => [l.linha, l.situacao])).toEqual([
      [2, 'ok'],
      [3, 'invalida'],
      [4, 'invalida'],
      [5, 'repetida'],
      [6, 'ok'],
    ]);
    expect(r.linhas[1]).toMatchObject({ erro: 'Informe o nome.' });
    expect(r.linhas[2]).toMatchObject({ nome: 'Bia', erro: 'Informe um telefone válido com DDD.' });
  });

  it('recusa arquivo sem coluna nome, vazio ou grande demais', () => {
    expect(lerCsvLeads('telefone\n34991355450')).toMatchObject({ ok: false });
    expect(lerCsvLeads('')).toEqual({ ok: false, erro: 'O arquivo está vazio.' });
    const grande = 'nome\n' + 'Ana\n'.repeat(2001);
    expect(lerCsvLeads(grande)).toEqual({
      ok: false,
      erro: 'Planilha com mais de 2.000 linhas. Divida em partes.',
    });
  });
});

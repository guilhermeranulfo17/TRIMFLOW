import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gerarPdfFicha } from '@/server/ficha/pdf';
import {
  arquivoFicha,
  fichaEmCsv,
  montarFicha,
  quantidadeDoOpcional,
  type DadosFicha,
} from '@/domain/ficha/cozinha';

const BASE: DadosFicha = {
  buffet: 'Stillus',
  cliente: 'Mariana Alves',
  tipoEvento: 'Casamento',
  data: '2027-05-15',
  inicio: '2027-05-15T23:00:00.000Z', // 20:00 em São Paulo
  duracaoMin: 300,
  fuso: 'America/Sao_Paulo',
  turno: 'Noite',
  espaco: { nome: 'Salão', noLocalDoCliente: false, localCliente: null },
  convidados: [
    { rotulo: 'Adultos', quantidade: 150 },
    { rotulo: 'Crianças de 0 a 5 anos', quantidade: 20 },
  ],
  pacote: { nome: 'Especial', porPessoa: true },
  cardapio: [
    { nome: 'Coquetel', itens: ['Mini acarajé', 'Bruschetta'] },
    { nome: 'Vazia', itens: [] },
  ],
  opcionais: [
    { nome: 'Bar de drinks', cobranca: 'por_pessoa', quantidade: 150 },
    { nome: 'Mesa de doces', cobranca: 'fixo', quantidade: 1 },
    { nome: 'Garçom extra', cobranca: 'por_unidade', quantidade: 3 },
    { nome: 'Hora de bar', cobranca: 'por_hora', quantidade: 1 },
    { nome: 'Item antigo', cobranca: null, quantidade: 2 },
  ],
  observacoes: ['  Noiva alérgica a camarão. ', ''],
};

describe('ficha da cozinha', () => {
  it('evento com horário de início e fim no fuso do buffet', () => {
    const f = montarFicha(BASE);
    expect(f.evento).toEqual([
      { rotulo: 'Cliente', valor: 'Mariana Alves' },
      { rotulo: 'Tipo de evento', valor: 'Casamento' },
      { rotulo: 'Data', valor: 'sábado, 15 de maio de 2027 (15/05/2027)' },
      { rotulo: 'Horário', valor: '20:00 às 01:00 (Noite)' },
      { rotulo: 'Local', valor: 'Salão' },
    ]);
  });

  it('buffet em domicílio mostra o local do cliente', () => {
    const f = montarFicha({
      ...BASE,
      espaco: {
        nome: 'No cliente',
        noLocalDoCliente: true,
        localCliente: 'Jardim Europa, Uberlândia',
      },
    });
    expect(f.evento.find((e) => e.rotulo === 'Local')!.valor).toBe(
      'No local do cliente: Jardim Europa, Uberlândia',
    );
  });

  it('convidados por faixa e total', () => {
    const f = montarFicha(BASE);
    expect(f.totalConvidados).toBe(170);
    expect(f.convidados).toHaveLength(2);
  });

  it('quantidade só onde o catálogo tem quantidade; nada de consumo inventado', () => {
    const f = montarFicha(BASE);
    expect(f.pacote).toEqual({ item: 'Especial', quantidade: 'para 170 convidados' });
    expect(f.opcionais).toEqual([
      { item: 'Bar de drinks', quantidade: 'para 170 convidados' },
      { item: 'Mesa de doces', quantidade: null },
      { item: 'Garçom extra', quantidade: '3 unidades' },
      { item: 'Hora de bar', quantidade: '1 hora' },
      { item: 'Item antigo', quantidade: null },
    ]);
    // pacote por faixa: sem quantidade
    expect(
      montarFicha({ ...BASE, pacote: { nome: 'Faixa', porPessoa: false } }).pacote!.quantidade,
    ).toBeNull();
    expect(quantidadeDoOpcional({ cobranca: 'por_pessoa', quantidade: 9 }, 0)).toBeNull();
  });

  it('cardápio sem seção vazia; observações limpas', () => {
    const f = montarFicha(BASE);
    expect(f.cardapio).toEqual([{ secao: 'Coquetel', itens: ['Mini acarajé', 'Bruschetta'] }]);
    expect(f.observacoes).toEqual(['Noiva alérgica a camarão.']);
  });

  it('nenhum preço na ficha', () => {
    expect(JSON.stringify(montarFicha(BASE))).not.toMatch(/R\$|\d+,\d{2}/);
  });

  it('planilha: BOM, ponto e vírgula, cabeçalho e uma linha por item', () => {
    const csv = fichaEmCsv(montarFicha(BASE));
    expect(csv.startsWith('﻿Seção;Item;Quantidade\r\n')).toBe(true);
    expect(csv).toContain('Cardápio: Coquetel;Mini acarajé;');
    expect(csv).toContain('Opcional;Garçom extra;3 unidades');
    expect(csv).toContain('Convidados;Total;170');
    expect(csv).not.toContain('R$');
  });

  it('planilha neutraliza fórmula e protege ; e aspas', () => {
    const csv = fichaEmCsv(montarFicha({ ...BASE, observacoes: ['=HYPERLINK("x")', 'a;b "c"'] }));
    expect(csv).toContain(`Observações;"'=HYPERLINK(""x"")";`);
    expect(csv).toContain('Observações;"a;b ""c""";');
  });

  it('nome do arquivo seguro', () => {
    const a = arquivoFicha('Ana/Souza', '2027-05-15', 'pdf');
    expect(a.nome).toBe('Ficha da cozinha - Ana Souza - 2027-05-15.pdf');
    expect(a.contentDisposition).toContain(
      'filename="Ficha da cozinha - Ana Souza - 2027-05-15.pdf"',
    );
  });

  it('PDF da ficha: válido e sem preço (GERAR_PDF_EXEMPLOS=1 grava um exemplo)', async () => {
    const pdf = await gerarPdfFicha(montarFicha({ ...BASE, retirados: ['Bolo cenográfico'] }));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.GERAR_PDF_EXEMPLOS === '1') {
      const pasta = join(process.cwd(), 'docs/capturas/ficha-cozinha');
      mkdirSync(pasta, { recursive: true });
      writeFileSync(join(pasta, 'exemplo.pdf'), pdf);
      writeFileSync(join(pasta, 'exemplo.csv'), fichaEmCsv(montarFicha(BASE)));
    }
  });
});

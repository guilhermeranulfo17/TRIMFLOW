import { describe, expect, it } from 'vitest';
import { contextoDoModelo, MODELOS } from '@/domain/modelos';
import { calcularOrcamento } from '@/domain/preco';
import {
  arquivoProposta,
  congelarConteudo,
  montarConteudo,
  planilhaDaProposta,
  rotuloTipoItem,
  type VersaoProposta,
} from '@/domain/proposta';
import { entradaDoMotor, ESCOLHAS_VAZIAS, type Escolhas } from '@/domain/publico';

/* Fase 5: proposta em planilha (CSV para o Excel em português). */

function modelo(extras: VersaoProposta['itens'] = []) {
  const ctx = contextoDoModelo(MODELOS.infantil);
  const tipo = ctx.tiposEvento[0]!;
  const pacote = ctx.pacotes.find((p) => p.tiposEventoIds.length === 0)!;
  const escolhas: Escolhas = {
    ...ESCOLHAS_VAZIAS,
    tipoEventoId: tipo.id,
    data: '2027-05-15',
    turnoId: ctx.turnos.find((t) => t.diasSemana.includes(6))!.id,
    espacoId: ctx.espacos[0]!.id,
    adultos: 60,
    pacoteId: pacote.id,
  };
  const r = calcularOrcamento(ctx, entradaDoMotor(ctx, escolhas, '2026-11-12')!);
  expect(r.ok).toBe(true);
  const itens = [
    ...r.linhas.map((l) => ({
      tipo: l.tipo,
      descricao: l.descricao,
      quantidade: l.quantidade,
      subtotalCentavos: l.subtotalCentavos,
      detalhe: l.detalhe,
    })),
    ...extras,
    {
      tipo: 'desconto',
      descricao: 'Desconto',
      quantidade: 1,
      subtotalCentavos: -29750,
      detalhe: '5% sobre o subtotal',
    },
  ];
  const v: VersaoProposta = {
    numero: 7,
    versao: 1,
    status: 'enviado',
    emitidaEm: null,
    validadeAte: '2026-11-27',
    hoje: '2026-11-12',
    resultado: r,
    conteudo: congelarConteudo({
      ctx,
      escolhas,
      textos: {
        condicoes: 'Sinal por Pix.',
        formasPagamento: ['Pix', 'Cartão de crédito'],
        naoIncluso: '',
        cancelamento: '',
        alteracaoConvidados: '',
      },
      aberturaModelo: null,
      clienteNome: 'Ana',
      buffetNome: 'Buffet',
    }),
    itens,
    totalCentavos: r.totalCentavos - 29750,
    data: '2027-05-15',
    convidados: 60,
    tipoEvento: tipo.nome,
    turno: null,
    espaco: null,
    clienteNome: 'Ana',
    observacoes: 'SEGREDO-NAO-VAI',
  };
  return montarConteudo(v, {
    nome: 'Buffet',
    logoUrl: null,
    corMarca: null,
    razaoSocial: null,
    cnpj: null,
    endereco: null,
    whatsappE164: null,
    rodapeOrkestra: true,
    modeloVisual: 'alegre',
  });
}

describe('proposta em planilha', () => {
  it('BOM, ponto e vírgula e o cabeçalho certo', () => {
    const csv = planilhaDaProposta(modelo());
    expect(csv.startsWith('﻿Tipo;Descrição;Detalhe;Valor\r\n')).toBe(true);
  });

  it('uma linha por item do investimento, valores em reais no formato brasileiro', () => {
    const m = modelo();
    const linhas = planilhaDaProposta(m).replace('﻿', '').split('\r\n');
    const itens = linhas.slice(1, 1 + m.investimento.linhas.length);
    expect(itens[0]).toMatch(/^Pacote;[^;]+;[^;]*;R\$ \d{1,3}(\.\d{3})*,\d{2}$/);
    // desconto: sinal depois do "R$" (sem apóstrofo da proteção contra fórmula)
    expect(itens.at(-1)).toBe('Desconto;Desconto;5% sobre o subtotal;R$ -297,50');
  });

  it('depois dos itens: total, valor por convidado e condições de pagamento', () => {
    const m = modelo();
    const csv = planilhaDaProposta(m);
    expect(csv).toContain(`Total;;;${m.investimento.total}\r\n`);
    expect(csv).toContain(`Valor por convidado;;;${m.investimento.porConvidado}\r\n`);
    expect(csv).toContain('Condições;Formas de pagamento: Pix e Cartão de crédito;;');
    expect(csv).toContain('Condições;Sinal por Pix.;;');
    expect(csv).toMatch(/Condições;1ª parcela: R\$ [\d.]+,\d{2} até \d{2}\/\d{2}\/\d{4};;/);
  });

  it('os mesmos dados da proposta (observações para o cliente entram; nada além)', () => {
    const csv = planilhaDaProposta(modelo());
    // a planilha não leva observações: só investimento e condições
    expect(csv).not.toContain('SEGREDO-NAO-VAI');
  });

  it('item retirado do pacote (Fase 6.5): "Retirado" sem desconto, valor negativo com', () => {
    const m = modelo([
      {
        tipo: 'retirado',
        descricao: 'Retirado: Bolo',
        quantidade: 1,
        subtotalCentavos: 0,
        detalhe: 'Retirado do pacote',
      },
      {
        tipo: 'retirado',
        descricao: 'Retirado: Mesa',
        quantidade: 1,
        subtotalCentavos: -2500,
        detalhe: 'Retirado do pacote, com desconto',
      },
    ]);
    const [bolo, mesa] = m.investimento.linhas.filter((l) => l.tipo === 'retirado');
    expect(bolo).toMatchObject({ valor: 'Retirado', negativo: false });
    expect(mesa).toMatchObject({ valor: '- R$ 25,00', negativo: true });
    const csv = planilhaDaProposta(m);
    expect(csv).toContain('Retirado do pacote;Retirado: Bolo;Retirado do pacote;Retirado\r\n');
    expect(csv).toContain(
      'Retirado do pacote;Retirado: Mesa;Retirado do pacote, com desconto;R$ -25,00',
    );
  });

  it('rótulos dos tipos e nome do arquivo .csv', () => {
    expect(rotuloTipoItem('hora_extra')).toBe('Hora extra');
    expect(rotuloTipoItem('xyz')).toBe('Item');
    expect(arquivoProposta({ numero: 42, buffet: 'Buffet X', cliente: 'Ana' }, 'csv').nome).toBe(
      'Proposta 0042 - Buffet X - Ana.csv',
    );
    expect(arquivoProposta({ numero: 42, buffet: 'Buffet X' }).nome).toBe(
      'Proposta 0042 - Buffet X.pdf',
    );
  });
});

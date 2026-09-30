import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/domain/money';
import { calcularOrcamento } from '@/domain/preco';
import { contextoBase, entradaAceitacao } from './fixture';

describe('teste de aceitação: festa infantil, sábado à tarde', () => {
  const r = calcularOrcamento(contextoBase(), entradaAceitacao());
  const linha = (tipo: string) => r.linhas.find((l) => l.tipo === tipo);

  it('é válido e está na versão 1 do motor', () => {
    expect(r.ok).toBe(true);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.versaoMotor).toBe(1);
  });

  it('65 convidados equivalentes e 80 pessoas físicas', () => {
    expect(r.convidadosEquivalentes).toBe(65);
    expect(r.pessoasFisicas).toBe(80);
  });

  it.each([
    ['pacote', 577500, 'R$ 5.775,00'],
    ['ajuste_dia', 57750, 'R$ 577,50'],
    ['opcional', 60000, 'R$ 600,00'],
    ['hora_extra', 45000, 'R$ 450,00'],
    ['desconto', -37013, '-R$ 370,13'],
  ])('linha %s = %s centavos (%s)', (tipo, centavos, texto) => {
    expect(linha(tipo)?.subtotalCentavos).toBe(centavos);
    expect(formatBRL(centavos)).toBe(texto);
  });

  it('totais batem até o centavo', () => {
    expect(r.subtotalCentavos).toBe(740250);
    expect(r.descontoCentavos).toBe(37013);
    expect(r.totalCentavos).toBe(703237);
    expect(r.sinalCentavos).toBe(210971);
    expect(r.saldoCentavos).toBe(492266);
    expect(formatBRL(r.totalCentavos)).toBe('R$ 7.032,37');
    expect(formatBRL(r.sinalCentavos)).toBe('R$ 2.109,71');
    expect(formatBRL(r.saldoCentavos)).toBe('R$ 4.922,66');
    expect(r.porConvidadoCentavos).toBe(10819);
  });

  it('linhas na ordem e com detalhe pronto para a proposta', () => {
    expect(r.linhas.map((l) => [l.tipo, l.descricao, l.detalhe])).toEqual([
      ['pacote', 'Pacote Super', '65 convidados equivalentes: faixa até 50 + 15 × R$ 85,00'],
      ['ajuste_dia', 'Ajuste sábado', '+10% sobre o pacote (R$ 5.775,00)'],
      ['opcional', 'Mesa temática', 'Valor fixo'],
      ['hora_extra', 'Hora extra', '1 h × R$ 450,00'],
      ['desconto', 'Desconto', '5% sobre R$ 7.402,50'],
    ]);
  });

  it('saldo em 2 parcelas mensais (não há tempo para 3), a última 7 dias antes', () => {
    expect(r.parcelas).toEqual([
      { numero: 1, valorCentavos: 246133, vencimento: '2026-10-07' },
      { numero: 2, valorCentavos: 246133, vencimento: '2026-11-07' },
    ]);
  });

  it('é serializável em JSON sem perda', () => {
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

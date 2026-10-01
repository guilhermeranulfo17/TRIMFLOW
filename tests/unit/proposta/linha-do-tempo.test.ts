import { describe, expect, it } from 'vitest';
import { descreverAtividade } from '@/domain/leads';

describe('linha do tempo: atividades da proposta', () => {
  it('orçamento interno e versões com o nome de quem fez', () => {
    expect(
      descreverAtividade('orcamento_criado', { numero: 42, total_centavos: 450000 }, 'Bia'),
    ).toBe('Bia criou o orçamento nº 0042: R$ 4.500,00');
    expect(descreverAtividade('versao_criada', { numero: 42, versao: 2 }, 'Bia')).toBe(
      'Bia criou a versão 2 do orçamento nº 0042',
    );
    expect(descreverAtividade('versao_criada', { numero: 42, versao: 3 })).toBe(
      'Refez a proposta nº 0042 (versão 3)',
    );
    expect(descreverAtividade('orcamento_criado', {})).toBe('A equipe criou o orçamento');
    expect(descreverAtividade('lead_criado', { canal: 'interno' }, 'Bia')).toBe(
      'Bia cadastrou o cliente',
    );
    expect(descreverAtividade('lead_criado', {})).toBe('Pediu orçamento pelo link');
  });

  it('envio por canal, aberturas, vencimento e pré-reserva pela equipe', () => {
    expect(descreverAtividade('proposta_enviada', { canal: 'whatsapp', numero: 7 }, 'Bia')).toBe(
      'Bia enviou a proposta nº 0007 pelo WhatsApp',
    );
    expect(descreverAtividade('proposta_enviada', { canal: 'pdf', numero: 7 }, 'Bia')).toBe(
      'Bia baixou o PDF da proposta nº 0007',
    );
    expect(descreverAtividade('proposta_enviada', { canal: 'link', numero: 7 }, 'Bia')).toBe(
      'Bia copiou o link da proposta nº 0007',
    );
    expect(descreverAtividade('proposta_aberta', { numero: 7, vez: 1 })).toBe(
      'Abriu a proposta nº 0007',
    );
    expect(descreverAtividade('proposta_aberta', { numero: 7, vez: 3 })).toBe(
      'Abriu a proposta nº 0007 (3ª vez)',
    );
    expect(descreverAtividade('orcamento_expirado', { numero: 7 })).toBe(
      'A proposta nº 0007 venceu',
    );
    expect(descreverAtividade('pre_reserva_pedida', { data: '2026-11-14' }, 'Bia')).toBe(
      'Bia pré-reservou 14/11/2026',
    );
    expect(descreverAtividade('pre_reserva_pedida', { data: '2026-11-14' })).toBe(
      'Pediu pré-reserva para 14/11/2026',
    );
  });
});

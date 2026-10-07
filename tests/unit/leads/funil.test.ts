import { describe, expect, it } from 'vitest';
import {
  acaoDoMovimento,
  destinosDoCard,
  etapaDoFunil,
  filtrosDaUrl,
  filtrosParaSql,
  filtrosParaUrl,
  proximoPasso,
  type CartaoFunil,
} from '@/domain/leads';

const ID = '11111111-1111-4111-8111-111111111111';
const card = (p: Partial<CartaoFunil>): CartaoFunil => ({
  id: ID,
  status: 'em_andamento',
  etapa: 'conversa',
  orcamentoParaReservar: null,
  temOrcamento: false,
  ...p,
});

describe('etapaDoFunil', () => {
  it('status e orçamento vigente decidem a coluna', () => {
    expect(etapaDoFunil('novo', null)).toBe('novo');
    expect(etapaDoFunil('abandonou', 'enviado')).toBe('novo');
    expect(etapaDoFunil('em_andamento', null)).toBe('conversa');
    expect(etapaDoFunil('em_andamento', 'expirado')).toBe('conversa');
    expect(etapaDoFunil('em_andamento', 'enviado')).toBe('proposta');
    expect(etapaDoFunil('em_andamento', 'visualizado')).toBe('proposta');
    expect(etapaDoFunil('pre_reservado', 'aceito')).toBe('pre_reserva');
    expect(etapaDoFunil('reservado', null)).toBe('reservado');
    expect(etapaDoFunil('frio', 'expirado')).toBe('perdido');
    expect(etapaDoFunil('perdido', null)).toBe('perdido');
    expect(etapaDoFunil('cancelado', null)).toBe('perdido');
    expect(etapaDoFunil('realizado', null)).toBeNull();
  });
});

describe('acaoDoMovimento', () => {
  it('para frente vira a ação de verdade', () => {
    expect(acaoDoMovimento(card({ status: 'novo', etapa: 'novo' }), 'conversa')).toEqual({
      tipo: 'contato',
    });
    expect(acaoDoMovimento(card({}), 'proposta')).toMatchObject({
      tipo: 'ir',
      href: `/app/orcamentos/novo?lead=${ID}`,
    });
    expect(acaoDoMovimento(card({ temOrcamento: true }), 'proposta')).toMatchObject({
      tipo: 'ir',
      href: `/app/leads/${ID}#titulo-orcamentos`,
    });
    const o = '22222222-2222-4222-8222-222222222222';
    expect(
      acaoDoMovimento(
        card({ etapa: 'proposta', temOrcamento: true, orcamentoParaReservar: o }),
        'pre_reserva',
      ),
    ).toEqual({ tipo: 'pre_reservar', orcamentoId: o });
    expect(acaoDoMovimento(card({ etapa: 'proposta' }), 'pre_reserva')).toMatchObject({
      tipo: 'ir',
    });
    expect(
      acaoDoMovimento(card({ status: 'pre_reservado', etapa: 'pre_reserva' }), 'reservado'),
    ).toMatchObject({ tipo: 'ir', href: `/app/leads/${ID}#titulo-reserva` });
    expect(acaoDoMovimento(card({}), 'reservado')).toMatchObject({ tipo: 'bloqueado' });
  });

  it('perder: de qualquer etapa aberta, menos da reservada', () => {
    for (const etapa of ['novo', 'conversa', 'proposta', 'pre_reserva'] as const) {
      expect(acaoDoMovimento(card({ etapa }), 'perdido')).toEqual({ tipo: 'perder' });
    }
    expect(
      acaoDoMovimento(card({ status: 'reservado', etapa: 'reservado' }), 'perdido'),
    ).toMatchObject({ tipo: 'bloqueado' });
  });

  it('para trás: bloqueado, menos a pré-reserva (cancela no lead)', () => {
    expect(acaoDoMovimento(card({ etapa: 'conversa' }), 'novo')).toMatchObject({
      tipo: 'bloqueado',
    });
    expect(acaoDoMovimento(card({ etapa: 'proposta' }), 'conversa')).toMatchObject({
      tipo: 'bloqueado',
    });
    expect(
      acaoDoMovimento(card({ status: 'pre_reservado', etapa: 'pre_reserva' }), 'conversa'),
    ).toMatchObject({ tipo: 'ir', href: `/app/leads/${ID}#titulo-reserva` });
    expect(
      acaoDoMovimento(card({ status: 'reservado', etapa: 'reservado' }), 'pre_reserva'),
    ).toMatchObject({ tipo: 'bloqueado' });
  });

  it('dos perdidos: só volta para Em conversa (reabrir, contato ou orçamento novo)', () => {
    expect(acaoDoMovimento(card({ status: 'perdido', etapa: 'perdido' }), 'conversa')).toEqual({
      tipo: 'reabrir',
    });
    expect(acaoDoMovimento(card({ status: 'frio', etapa: 'perdido' }), 'conversa')).toEqual({
      tipo: 'contato',
    });
    expect(
      acaoDoMovimento(card({ status: 'cancelado', etapa: 'perdido' }), 'conversa'),
    ).toMatchObject({ tipo: 'ir', href: `/app/orcamentos/novo?lead=${ID}` });
    expect(
      acaoDoMovimento(card({ status: 'perdido', etapa: 'perdido' }), 'proposta'),
    ).toMatchObject({ tipo: 'bloqueado' });
  });

  it('mesma coluna não faz nada; destinos do "Mover para"', () => {
    expect(acaoDoMovimento(card({}), 'conversa')).toEqual({ tipo: 'nada' });
    expect(destinosDoCard(card({ status: 'novo', etapa: 'novo' }))).toEqual([
      'conversa',
      'proposta',
      'pre_reserva',
      'perdido',
    ]);
    expect(destinosDoCard(card({ status: 'reservado', etapa: 'reservado' }))).toEqual([]);
    expect(destinosDoCard(card({ status: 'perdido', etapa: 'perdido' }))).toEqual(['conversa']);
  });
});

describe('proximoPasso', () => {
  const agora = new Date('2026-10-15T15:00:00Z'); // 12h em São Paulo
  const f = 'America/Sao_Paulo';
  it('atrasada, hoje, amanhã e outro dia', () => {
    expect(proximoPasso(null, agora, f)).toBeNull();
    expect(
      proximoPasso({ titulo: 'Ligar', vence: new Date('2026-10-15T12:00:00Z') }, agora, f),
    ).toEqual({ texto: 'Atrasada: Ligar', atrasado: true });
    expect(
      proximoPasso({ titulo: 'Ligar', vence: new Date('2026-10-15T17:00:00Z') }, agora, f),
    ).toEqual({ texto: 'Hoje 14h: Ligar', atrasado: false });
    expect(
      proximoPasso({ titulo: 'Ligar', vence: new Date('2026-10-15T17:30:00Z') }, agora, f)!.texto,
    ).toBe('Hoje 14h30: Ligar');
    expect(
      proximoPasso({ titulo: 'Ligar', vence: new Date('2026-10-16T12:00:00Z') }, agora, f)!.texto,
    ).toBe('Amanhã: Ligar');
    expect(
      proximoPasso({ titulo: 'Ligar', vence: new Date('2026-10-20T12:00:00Z') }, agora, f)!.texto,
    ).toBe('20/10: Ligar');
  });
});

describe('visão na URL', () => {
  it('funil fica na URL e não vai para o SQL', () => {
    const f = filtrosDaUrl({ visao: 'funil', q: 'ana' });
    expect(f.visao).toBe('funil');
    expect(filtrosParaUrl(f)).toBe('visao=funil&q=ana');
    expect(filtrosParaSql(f)).toEqual({ busca: 'ana' });
    expect(filtrosDaUrl({ visao: 'outra' }).visao).toBeUndefined();
  });
});

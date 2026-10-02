import { describe, expect, it } from 'vitest';
import {
  podeEscrever,
  situacaoConta,
  suspensaoPrevista,
  type AssinaturaSituacao,
  type EntradaSituacao,
} from '@/domain/cobranca/situacao';

// 12:00 em São Paulo de 10/11/2026 (15:00 UTC)
const agora = new Date('2026-11-10T15:00:00Z');
const base: EntradaSituacao = {
  agora,
  fuso: 'America/Sao_Paulo',
  trialAte: null,
  isenta: false,
  suspensaManual: false,
  assinatura: null,
};
const ass = (a: Partial<AssinaturaSituacao>): AssinaturaSituacao => ({
  status: 'ativa',
  pagoAte: null,
  atrasadaDesde: null,
  ...a,
});

describe('situacaoConta', () => {
  it('teste em andamento e teste vencido', () => {
    expect(situacaoConta({ ...base, trialAte: new Date('2026-11-11T00:00:00Z') })).toBe('trial');
    expect(situacaoConta({ ...base, trialAte: new Date('2026-11-10T14:59:59Z') })).toBe('suspenso');
    expect(situacaoConta(base)).toBe('suspenso');
  });

  it('assinatura pendente não tira do teste; sem teste fica suspensa', () => {
    const a = ass({ status: 'pendente' });
    expect(situacaoConta({ ...base, assinatura: a, trialAte: new Date('2026-11-12') })).toBe(
      'trial',
    );
    expect(situacaoConta({ ...base, assinatura: a })).toBe('suspenso');
  });

  it('período pago cobre hoje = ativo, mesmo durante o teste', () => {
    expect(situacaoConta({ ...base, assinatura: ass({ pagoAte: '2026-11-10' }) })).toBe('ativo');
    expect(
      situacaoConta({
        ...base,
        trialAte: new Date('2026-11-20'),
        assinatura: ass({ pagoAte: '2026-12-19' }),
      }),
    ).toBe('ativo');
  });

  it('dia de vencimento ainda é ativo; atraso de 1 a 7 dias é inadimplente; 8 suspende', () => {
    const s = (pagoAte: string, atrasadaDesde: string | null = null) =>
      situacaoConta({ ...base, assinatura: ass({ pagoAte, atrasadaDesde }) });
    expect(s('2026-11-09')).toBe('ativo'); // vence hoje (10/11)
    expect(s('2026-11-08')).toBe('inadimplente'); // venceu ontem
    expect(s('2026-11-02')).toBe('inadimplente'); // 7 dias
    expect(s('2026-11-01')).toBe('suspenso'); // 8 dias
    expect(s('2026-11-08', '2026-11-03')).toBe('inadimplente');
    expect(s('2026-11-08', '2026-11-02')).toBe('suspenso');
  });

  it('cancelada mantém o acesso até o fim do período pago', () => {
    const a = (pagoAte: string) => ass({ status: 'cancelada', pagoAte });
    expect(situacaoConta({ ...base, assinatura: a('2026-11-10') })).toBe('cancelado');
    expect(situacaoConta({ ...base, assinatura: a('2026-11-09') })).toBe('suspenso');
  });

  it('suspensão manual vence tudo; cortesia fica ativa sem assinatura', () => {
    expect(
      situacaoConta({
        ...base,
        suspensaManual: true,
        isenta: true,
        trialAte: new Date('2027-01-01'),
      }),
    ).toBe('suspenso');
    expect(situacaoConta({ ...base, isenta: true })).toBe('ativo');
  });

  it('usa a data civil do fuso da empresa (virada do dia em SP)', () => {
    // 01:30 UTC de 11/11 ainda é 10/11 em São Paulo
    const noite = new Date('2026-11-11T01:30:00Z');
    expect(
      situacaoConta({ ...base, agora: noite, assinatura: ass({ pagoAte: '2026-11-10' }) }),
    ).toBe('ativo');
    expect(
      situacaoConta({
        ...base,
        agora: noite,
        fuso: 'UTC',
        assinatura: ass({ pagoAte: '2026-11-10' }),
      }),
    ).toBe('ativo'); // 11/11 em UTC = dia do vencimento
  });
});

describe('suspensaoPrevista e podeEscrever', () => {
  it('primeiro dia sem acesso = início do atraso + 8', () => {
    expect(suspensaoPrevista(ass({ pagoAte: '2026-11-08' }))).toBe('2026-11-17');
    expect(suspensaoPrevista(ass({ pagoAte: '2026-11-08', atrasadaDesde: '2026-11-05' }))).toBe(
      '2026-11-13',
    );
    expect(suspensaoPrevista(null)).toBeNull();
    expect(suspensaoPrevista(ass({ status: 'cancelada', pagoAte: '2026-11-08' }))).toBeNull();
  });

  it('só suspensa não escreve', () => {
    expect(podeEscrever('suspenso')).toBe(false);
    for (const s of ['trial', 'ativo', 'inadimplente', 'cancelado'] as const) {
      expect(podeEscrever(s)).toBe(true);
    }
  });
});

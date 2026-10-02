import { describe, expect, it } from 'vitest';
import {
  centavosParaReais,
  limparPayload,
  normalizarEvento,
  proximoStatus,
  reaisParaCentavos,
  STATUS_COBRANCA,
  statusDoAsaas,
} from '@/domain/cobranca/asaas-eventos';

const pagamento = {
  object: 'payment',
  id: 'pay_123',
  customer: 'cus_1',
  subscription: 'sub_1',
  value: 97,
  billingType: 'PIX',
  status: 'RECEIVED',
  dueDate: '2026-11-10',
  paymentDate: '2026-11-09',
  invoiceUrl: 'https://sandbox.asaas.com/i/abc',
  externalReference: '11111111-1111-4111-8111-111111111111',
  description: 'Orkestra Profissional',
};

describe('valores', () => {
  it('reais ↔ centavos sem erro de float', () => {
    expect(reaisParaCentavos(97)).toBe(9700);
    expect(reaisParaCentavos(0.1 + 0.2)).toBe(30);
    expect(reaisParaCentavos(247.9)).toBe(24790);
    expect(reaisParaCentavos('14.7')).toBe(1470);
    expect(reaisParaCentavos(-1)).toBeNull();
    expect(reaisParaCentavos('abc')).toBeNull();
    expect(reaisParaCentavos(null)).toBeNull();
    expect(centavosParaReais(9700)).toBe(97);
    expect(centavosParaReais(24790)).toBe(247.9);
  });
});

describe('status monotônico', () => {
  it('nunca regride; cancelada só de pendente ou vencida e é final', () => {
    expect(proximoStatus(null, 'vencida')).toBe('vencida');
    expect(proximoStatus('recebida', 'vencida')).toBe('recebida');
    expect(proximoStatus('recebida', 'confirmada')).toBe('recebida');
    expect(proximoStatus('vencida', 'recebida')).toBe('recebida');
    expect(proximoStatus('confirmada', 'recebida')).toBe('recebida');
    expect(proximoStatus('recebida', 'estornada')).toBe('estornada');
    expect(proximoStatus('estornada', 'recebida')).toBe('estornada');
    expect(proximoStatus('pendente', 'cancelada')).toBe('cancelada');
    expect(proximoStatus('vencida', 'cancelada')).toBe('cancelada');
    expect(proximoStatus('recebida', 'cancelada')).toBe('recebida');
    expect(proximoStatus('cancelada', 'recebida')).toBe('cancelada');
    expect(proximoStatus('vencida', 'pendente')).toBe('vencida');
  });

  it('tabela completa é estável (aplicar o mesmo de novo não muda)', () => {
    for (const a of STATUS_COBRANCA) {
      for (const b of STATUS_COBRANCA) {
        const r = proximoStatus(a, b);
        expect(proximoStatus(r, b)).toBe(r);
      }
    }
  });

  it('status do Asaas', () => {
    expect(statusDoAsaas('PENDING')).toBe('pendente');
    expect(statusDoAsaas('OVERDUE')).toBe('vencida');
    expect(statusDoAsaas('CONFIRMED')).toBe('confirmada');
    expect(statusDoAsaas('RECEIVED_IN_CASH')).toBe('recebida');
    expect(statusDoAsaas('REFUNDED')).toBe('estornada');
    expect(statusDoAsaas('CHARGEBACK_DISPUTE')).toBe('estornada');
    expect(statusDoAsaas('ALGO_NOVO')).toBeNull();
  });
});

describe('normalizarEvento', () => {
  it('pagamento recebido', () => {
    const e = normalizarEvento({ id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: pagamento });
    expect(e).toEqual({
      eventoId: 'evt_1',
      tipo: 'PAYMENT_RECEIVED',
      tratado: true,
      assinaturaCancelada: null,
      cobranca: {
        asaasId: 'pay_123',
        assinaturaAsaasId: 'sub_1',
        clienteAsaasId: 'cus_1',
        valorCentavos: 9700,
        vencimento: '2026-11-10',
        status: 'recebida',
        forma: 'PIX',
        linkFatura: 'https://sandbox.asaas.com/i/abc',
        pagoEm: '2026-11-09',
        referencia: '11111111-1111-4111-8111-111111111111',
      },
    });
  });

  it('o tipo do evento manda no status (OVERDUE com status desatualizado)', () => {
    const e = normalizarEvento({
      id: 'evt_2',
      event: 'PAYMENT_OVERDUE',
      payment: { ...pagamento, status: 'PENDING' },
    });
    expect(e?.cobranca?.status).toBe('vencida');
    const c = normalizarEvento({
      id: 'evt_3',
      event: 'PAYMENT_CREATED',
      payment: { ...pagamento, status: 'PENDING', invoiceUrl: 'javascript:x' },
    });
    expect(c?.cobranca).toMatchObject({ status: 'pendente', linkFatura: null });
  });

  it('assinatura cancelada', () => {
    expect(
      normalizarEvento({
        id: 'evt_4',
        event: 'SUBSCRIPTION_DELETED',
        subscription: { id: 'sub_1' },
      }),
    ).toMatchObject({ tratado: true, assinaturaCancelada: { asaasId: 'sub_1', referencia: null } });
  });

  it('evento desconhecido fica não tratado; payload inválido = null', () => {
    expect(normalizarEvento({ id: 'evt_5', event: 'ACCOUNT_STATUS_UPDATED' })).toMatchObject({
      tratado: false,
      cobranca: null,
    });
    expect(
      normalizarEvento({ id: 'evt_6', event: 'PAYMENT_RECEIVED', payment: { id: 'x' } }),
    ).toMatchObject({ tratado: false });
    expect(normalizarEvento({ event: 'PAYMENT_RECEIVED' })).toBeNull();
    expect(normalizarEvento('lixo')).toBeNull();
    expect(normalizarEvento(null)).toBeNull();
  });
});

describe('limparPayload', () => {
  it('remove dados pessoais e campos não listados', () => {
    const limpo = limparPayload({
      id: 'evt_1',
      event: 'PAYMENT_RECEIVED',
      payment: { ...pagamento, customerName: 'Maria', cpfCnpj: '52998224725', email: 'm@x.com' },
      subscription: { id: 'sub_1', customerName: 'Maria', status: 'ACTIVE' },
      cliente: { nome: 'Maria' },
    });
    const texto = JSON.stringify(limpo);
    expect(texto).not.toContain('Maria');
    expect(texto).not.toContain('52998224725');
    expect(texto).not.toContain('m@x.com');
    expect(texto).not.toContain('description');
    expect(limpo).toMatchObject({
      id: 'evt_1',
      payment: { id: 'pay_123', value: 97, status: 'RECEIVED' },
      subscription: { id: 'sub_1', status: 'ACTIVE' },
    });
    expect(limparPayload(null)).toEqual({
      id: undefined,
      event: undefined,
      dateCreated: undefined,
    });
  });
});

/*
 * Tradução pura dos eventos do Asaas (webhook e reconciliação) para o formato que
 * public.cobranca_registrar_evento grava. A regra de status monotônico (proximoStatus) é
 * ESPELHO de public._cobranca_proximo_status, com teste de equivalência.
 */

export const STATUS_COBRANCA = [
  'pendente',
  'vencida',
  'confirmada',
  'recebida',
  'estornada',
  'cancelada',
] as const;
export type StatusCobranca = (typeof STATUS_COBRANCA)[number];

/** Eventos que mudam alguma coisa. Os demais ficam gravados e ignorados. */
export const EVENTOS_TRATADOS = [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'PAYMENT_DELETED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'SUBSCRIPTION_DELETED',
  'SUBSCRIPTION_INACTIVATED',
] as const;

const STATUS_DO_EVENTO: Partial<Record<string, StatusCobranca>> = {
  PAYMENT_CONFIRMED: 'confirmada',
  PAYMENT_RECEIVED: 'recebida',
  PAYMENT_OVERDUE: 'vencida',
  PAYMENT_REFUNDED: 'estornada',
  PAYMENT_DELETED: 'cancelada',
  PAYMENT_CHARGEBACK_REQUESTED: 'estornada',
};

/** status da cobrança no Asaas → status interno */
export function statusDoAsaas(status: string | null | undefined): StatusCobranca | null {
  switch (status) {
    case 'PENDING':
    case 'AWAITING_RISK_ANALYSIS':
      return 'pendente';
    case 'OVERDUE':
    case 'DUNNING_REQUESTED':
      return 'vencida';
    case 'CONFIRMED':
      return 'confirmada';
    case 'RECEIVED':
    case 'RECEIVED_IN_CASH':
    case 'DUNNING_RECEIVED':
    case 'REFUND_REQUESTED':
    case 'REFUND_IN_PROGRESS':
      return 'recebida';
    case 'REFUNDED':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'estornada';
    default:
      return null;
  }
}

const ORDEM: Record<StatusCobranca, number> = {
  pendente: 0,
  vencida: 1,
  cancelada: 1,
  confirmada: 2,
  recebida: 3,
  estornada: 4,
};

/**
 * Status depois de um evento: nunca regride (evento fora de ordem é ignorado).
 * pendente < vencida < confirmada < recebida < estornada; "cancelada" só sai de pendente ou
 * vencida e é final (cobrança apagada no Asaas).
 */
export function proximoStatus(atual: StatusCobranca | null, novo: StatusCobranca): StatusCobranca {
  if (atual === null) return novo;
  if (atual === 'cancelada') return atual;
  if (novo === 'cancelada') return atual === 'pendente' || atual === 'vencida' ? novo : atual;
  return ORDEM[novo] > ORDEM[atual] ? novo : atual;
}

/** Cobrança que conta como paga (cobre o período). */
export const statusPago = (s: StatusCobranca): boolean => s === 'confirmada' || s === 'recebida';

// ---------------------------------------------------------------------------
// Normalização do payload
// ---------------------------------------------------------------------------

export type CobrancaEvento = {
  asaasId: string;
  assinaturaAsaasId: string | null;
  clienteAsaasId: string | null;
  valorCentavos: number;
  vencimento: string;
  status: StatusCobranca;
  forma: string | null;
  linkFatura: string | null;
  pagoEm: string | null;
  referencia: string | null;
};

export type EventoNormalizado = {
  eventoId: string;
  tipo: string;
  tratado: boolean;
  cobranca: CobrancaEvento | null;
  /** SUBSCRIPTION_DELETED / INACTIVATED */
  assinaturaCancelada: { asaasId: string; referencia: string | null } | null;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
const str = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null;
const dataCivil = (v: unknown): string | null => {
  const s = str(v, 30);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const FORMAS = ['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'];

/** Reais (número com até 2 casas, como o Asaas manda) → centavos, sem aritmética de float. */
export function reaisParaCentavos(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const s = typeof v === 'number' ? v.toFixed(2) : v.trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}

/** Centavos → número em reais para a API do Asaas (9700 → 97). */
export const centavosParaReais = (c: number): number => Number((c / 100).toFixed(2));

/** Lê uma cobrança do Asaas (objeto "payment" do webhook ou da listagem). */
export function lerCobranca(p: unknown, statusForcado?: StatusCobranca): CobrancaEvento | null {
  const c = obj(p);
  if (!c) return null;
  const asaasId = str(c.id, 60);
  const valor = reaisParaCentavos(c.value);
  const vencimento = dataCivil(c.dueDate);
  const status = statusForcado ?? statusDoAsaas(str(c.status, 40));
  if (!asaasId || valor === null || !vencimento || !status) return null;
  const forma = str(c.billingType, 20);
  const link = str(c.invoiceUrl, 500);
  return {
    asaasId,
    assinaturaAsaasId: str(c.subscription, 60),
    clienteAsaasId: str(c.customer, 60),
    valorCentavos: valor,
    vencimento,
    status,
    forma: forma && FORMAS.includes(forma) ? forma : null,
    linkFatura: link && /^https?:\/\//.test(link) ? link : null,
    pagoEm:
      dataCivil(c.clientPaymentDate) ?? dataCivil(c.paymentDate) ?? dataCivil(c.confirmedDate),
    referencia: str(c.externalReference, 100),
  };
}

/** Webhook do Asaas → evento normalizado (null = payload inválido: responde 400). */
export function normalizarEvento(corpo: unknown): EventoNormalizado | null {
  const e = obj(corpo);
  const eventoId = str(e?.id, 120);
  const tipo = str(e?.event, 60);
  if (!e || !eventoId || !tipo) return null;
  const tratado = (EVENTOS_TRATADOS as readonly string[]).includes(tipo);
  const vazio: EventoNormalizado = {
    eventoId,
    tipo,
    tratado: false,
    cobranca: null,
    assinaturaCancelada: null,
  };
  if (!tratado) return vazio;
  if (tipo.startsWith('SUBSCRIPTION_')) {
    const s = obj(e.subscription);
    const asaasId = str(s?.id, 60);
    if (!asaasId) return vazio;
    return {
      ...vazio,
      tratado: true,
      assinaturaCancelada: { asaasId, referencia: str(s?.externalReference, 100) },
    };
  }
  const cobranca = lerCobranca(e.payment, STATUS_DO_EVENTO[tipo]);
  return cobranca ? { ...vazio, tratado: true, cobranca } : vazio;
}

/** Só ids, valores, datas e status: nome, CPF, e-mail e descrição do pagador ficam de fora. */
export function limparPayload(corpo: unknown): Record<string, unknown> {
  const e = obj(corpo) ?? {};
  const escolher = (o: Obj | null, chaves: string[]) =>
    o ? Object.fromEntries(chaves.filter((k) => k in o).map((k) => [k, o[k]])) : undefined;
  const limpo: Record<string, unknown> = {
    id: e.id,
    event: e.event,
    dateCreated: e.dateCreated,
  };
  const payment = escolher(obj(e.payment), [
    'id',
    'subscription',
    'customer',
    'value',
    'billingType',
    'status',
    'dueDate',
    'paymentDate',
    'clientPaymentDate',
    'confirmedDate',
    'invoiceUrl',
    'externalReference',
    'deleted',
  ]);
  const subscription = escolher(obj(e.subscription), [
    'id',
    'customer',
    'status',
    'value',
    'cycle',
    'nextDueDate',
    'externalReference',
    'deleted',
  ]);
  if (payment) limpo.payment = payment;
  if (subscription) limpo.subscription = subscription;
  return limpo;
}

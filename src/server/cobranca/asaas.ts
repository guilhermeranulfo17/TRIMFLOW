import 'server-only';
import { centavosParaReais } from '@/domain/cobranca/asaas-eventos';
import type { ConfigAsaas } from './config';

/*
 * Cliente da API do Asaas com fetch (sem SDK). Header access_token; timeout de 15 s.
 * Erro vira ErroAsaas com um código curto (ASAAS_HTTP_400, ASAAS_REDE…): o código vai para o
 * log, a mensagem ao usuário é sempre simples. Nunca loga corpo de requisição (tem CPF/CNPJ).
 */

export class ErroAsaas extends Error {
  constructor(
    readonly codigo: string,
    readonly status?: number,
  ) {
    super(codigo);
    this.name = 'ErroAsaas';
  }
}

export type CicloAsaas = 'MONTHLY' | 'YEARLY';

export type PagamentoAsaas = {
  id: string;
  subscription?: string | null;
  customer?: string;
  value: number;
  status: string;
  dueDate: string;
  invoiceUrl?: string;
  billingType?: string;
  paymentDate?: string | null;
  externalReference?: string | null;
};

export type ClienteAsaas = ReturnType<typeof criarClienteAsaas>;

export function criarClienteAsaas(config: ConfigAsaas, o: { fetch?: typeof fetch } = {}) {
  const fazerFetch = o.fetch ?? fetch;

  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    let r: Response;
    try {
      r = await fazerFetch(`${config.urlBase}${caminho}`, {
        method: metodo,
        headers: {
          access_token: config.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Orkestra',
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ErroAsaas('ASAAS_REDE');
    }
    if (!r.ok) throw new ErroAsaas(`ASAAS_HTTP_${r.status}`, r.status);
    return (await r.json()) as T;
  }

  return {
    criarCliente(d: { nome: string; documento: string; email: string; empresaId: string }) {
      return chamar<{ id: string }>('POST', '/customers', {
        name: d.nome,
        cpfCnpj: d.documento,
        email: d.email,
        externalReference: d.empresaId,
      });
    },

    atualizarCliente(id: string, d: { nome: string; documento: string; email: string }) {
      return chamar<{ id: string }>('PUT', `/customers/${encodeURIComponent(id)}`, {
        name: d.nome,
        cpfCnpj: d.documento,
        email: d.email,
      });
    },

    /** billingType UNDEFINED: quem paga escolhe Pix, boleto ou cartão na página do Asaas. */
    criarAssinatura(d: {
      cliente: string;
      valorCentavos: number;
      vencimento: string;
      ciclo: CicloAsaas;
      descricao: string;
      empresaId: string;
    }) {
      return chamar<{ id: string }>('POST', '/subscriptions', {
        customer: d.cliente,
        billingType: 'UNDEFINED',
        value: centavosParaReais(d.valorCentavos),
        nextDueDate: d.vencimento,
        cycle: d.ciclo,
        description: d.descricao,
        externalReference: d.empresaId,
      });
    },

    /** Valor e ciclo novos valem também para as cobranças ainda não pagas. */
    atualizarAssinatura(
      id: string,
      d: { valorCentavos: number; ciclo?: CicloAsaas; descricao?: string },
    ) {
      return chamar<{ id: string }>('PUT', `/subscriptions/${encodeURIComponent(id)}`, {
        value: centavosParaReais(d.valorCentavos),
        ...(d.ciclo ? { cycle: d.ciclo } : {}),
        ...(d.descricao ? { description: d.descricao } : {}),
        updatePendingPayments: true,
      });
    },

    cancelarAssinatura(id: string) {
      return chamar<{ deleted?: boolean }>('DELETE', `/subscriptions/${encodeURIComponent(id)}`);
    },

    async cobrancasDaAssinatura(id: string): Promise<PagamentoAsaas[]> {
      const r = await chamar<{ data?: PagamentoAsaas[] }>(
        'GET',
        `/subscriptions/${encodeURIComponent(id)}/payments?limit=100`,
      );
      return r.data ?? [];
    },

    criarCobranca(d: {
      cliente: string;
      valorCentavos: number;
      vencimento: string;
      descricao: string;
      empresaId: string;
    }) {
      return chamar<PagamentoAsaas>('POST', '/payments', {
        customer: d.cliente,
        billingType: 'UNDEFINED',
        value: centavosParaReais(d.valorCentavos),
        dueDate: d.vencimento,
        description: d.descricao,
        externalReference: d.empresaId,
      });
    },

    buscarCobranca(id: string) {
      return chamar<PagamentoAsaas>('GET', `/payments/${encodeURIComponent(id)}`);
    },
  };
}

export const cicloAsaas = (ciclo: 'mensal' | 'anual'): CicloAsaas =>
  ciclo === 'anual' ? 'YEARLY' : 'MONTHLY';

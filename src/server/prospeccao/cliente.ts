import 'server-only';
import { mesmoTelefone, telefoneDoCrm, ultimos8 } from '@/domain/prospeccao';

/*
 * Cliente do CRM de prospecção (ARQUITETURA §81), só com `fetch` (sem SDK). O token vem de
 * CRM_PROSPECCAO_TOKEN (variável do servidor, nunca NEXT_PUBLIC_): sem ele, o rastreio fica
 * desligado e nada é chamado. Cada chamada tem prazo curto: o CRM nunca segura o Orkestra.
 */

export const URL_PADRAO_CRM = 'https://crm-buffets.emergent.host/api';
const PRAZO_MS = 8_000;

/** O que o Orkestra lê de um lead: só o necessário para decidir e avisar. */
export type LeadCrm = { id: string; telefone: string | null; etapa: string | null };

/** Upsert pelo telefone (55 + DDD + número): o CRM altera só os campos enviados. */
export type CamposLead = {
  telefone: string;
  contato?: string;
  buffet?: string;
  tem_whatsapp?: string;
  temperatura?: string;
  proximo_passo?: string;
  etapa?: string;
};

export type ClienteCrm = {
  /** `GET /leads/{id}`; null se o lead não existe. */
  porId(id: string): Promise<LeadCrm | null>;
  /** `GET /leads?q=<8 últimos dígitos>`, conferindo DDD e número; null se não achar. */
  porTelefone(telefone: string): Promise<LeadCrm | null>;
  /** `POST /leads/upsert`; devolve o lead quando a resposta traz o id. */
  upsert(campos: CamposLead): Promise<LeadCrm | null>;
  /** `POST /leads/{id}/eventos`: uma linha na linha do tempo. */
  evento(id: string, texto: string): Promise<void>;
};

/** Falha do CRM: só o código vai para o log (`CRM_404`, `CRM_500`…), nunca a resposta. */
export class ErroCrm extends Error {
  readonly codigo: string;
  constructor(status: number) {
    super(`CRM respondeu ${status}`);
    this.name = 'ErroCrm';
    this.codigo = `CRM_${status}`;
  }
}

function lerLead(bruto: unknown): LeadCrm | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as Record<string, unknown>;
  // `GET /leads/{id}` devolve { lead, eventos }; a busca e o upsert, o lead direto
  const l = (o.lead && typeof o.lead === 'object' ? o.lead : o) as Record<string, unknown>;
  if (typeof l.id !== 'string' || !l.id) return null;
  return {
    id: l.id,
    telefone: typeof l.telefone === 'string' ? l.telefone : null,
    etapa: typeof l.etapa === 'string' ? l.etapa : null,
  };
}

export function criarClienteCrm(o: {
  token: string;
  url?: string;
  fetch?: typeof fetch;
  prazoMs?: number;
}): ClienteCrm {
  const base = (o.url || URL_PADRAO_CRM).replace(/\/+$/, '');
  const buscar = o.fetch ?? fetch;

  async function chamar(caminho: string, corpo?: unknown): Promise<unknown> {
    const resposta = await buscar(`${base}${caminho}`, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${o.token}`,
        Accept: 'application/json',
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: 'no-store',
      signal: AbortSignal.timeout(o.prazoMs ?? PRAZO_MS),
    });
    if (!resposta.ok) throw new ErroCrm(resposta.status);
    return resposta.json().catch(() => null);
  }

  return {
    async porId(id) {
      try {
        return lerLead(await chamar(`/leads/${encodeURIComponent(id)}`));
      } catch (erro) {
        if (erro instanceof ErroCrm && erro.codigo === 'CRM_404') return null;
        throw erro;
      }
    },

    async porTelefone(telefone) {
      const alvo = telefoneDoCrm(telefone);
      if (!alvo) return null;
      const lista = await chamar(`/leads?q=${ultimos8(alvo)}`);
      const leads = (Array.isArray(lista) ? lista : [])
        .map(lerLead)
        .filter((l): l is LeadCrm => l !== null && mesmoTelefone(l.telefone, alvo));
      // o número idêntico vale mais do que o mesmo número sem o 9 na frente
      return leads.find((l) => telefoneDoCrm(l.telefone) === alvo) ?? leads[0] ?? null;
    },

    async upsert(campos) {
      return lerLead(await chamar('/leads/upsert', campos));
    },

    async evento(id, texto) {
      await chamar(`/leads/${encodeURIComponent(id)}/eventos`, { texto });
    },
  };
}

/** Cliente com o token do ambiente; null = rastreio desligado (sem CRM_PROSPECCAO_TOKEN). */
export function clienteCrmDoAmbiente(): ClienteCrm | null {
  const token = process.env.CRM_PROSPECCAO_TOKEN?.trim();
  if (!token) return null;
  return criarClienteCrm({ token, url: process.env.CRM_PROSPECCAO_URL?.trim() || undefined });
}

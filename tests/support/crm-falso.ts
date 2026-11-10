/*
 * CRM de prospecção falso, em memória, com o mesmo contrato da API de verdade (conferido com
 * leituras na API real em nov/2026):
 *   GET  /leads?q=<8 últimos dígitos>  → [lead, …]
 *   GET  /leads/{id}                   → { lead, eventos } | 404
 *   POST /leads/upsert                 → cria ou atualiza pelo telefone, só os campos enviados
 *   POST /leads/{id}/eventos {texto}   → linha do tempo
 * Sem token: 401. Serve como `fetch` do cliente (server/prospeccao/cliente).
 */

export type LeadFalso = { id: string; telefone: string; etapa: string } & Record<string, string>;

export function crmFalso(token = 'token-de-teste') {
  const leads = new Map<string, LeadFalso>();
  const eventos: { leadId: string; texto: string }[] = [];
  const chamadas: { metodo: string; caminho: string; corpo: unknown }[] = [];
  let proximo = 1;
  /** quando ligado, toda chamada falha (CRM fora do ar) */
  const estado = { fora: false as boolean | 'demora' };

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const novoId = () => `00000000-0000-4000-8000-${String(proximo++).padStart(12, '0')}`;

  const buscar: typeof fetch = async (entrada, init) => {
    const url = new URL(String(entrada));
    const metodo = init?.method ?? 'GET';
    const caminho = url.pathname.replace(/^\/api/, '') + url.search;
    const corpo = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    chamadas.push({ metodo, caminho, corpo });
    if (estado.fora === 'demora') {
      // respeita o prazo do cliente (AbortSignal.timeout)
      await new Promise((_, rejeitar) => {
        init?.signal?.addEventListener('abort', () =>
          rejeitar(Object.assign(new Error('prazo'), { name: 'TimeoutError' })),
        );
      });
    }
    if (estado.fora) return json({ detail: 'erro interno' }, 500);
    const cabecalhos = new Headers(init?.headers);
    if (cabecalhos.get('Authorization') !== `Bearer ${token}`) {
      return json({ detail: 'Não autenticado' }, 401);
    }

    const partes = url.pathname
      .replace(/^\/api/, '')
      .split('/')
      .filter(Boolean);
    if (metodo === 'GET' && partes.length === 1 && partes[0] === 'leads') {
      const q = url.searchParams.get('q') ?? '';
      return json([...leads.values()].filter((l) => l.telefone.includes(q)));
    }
    if (metodo === 'GET' && partes.length === 2 && partes[0] === 'leads') {
      const lead = leads.get(partes[1]!);
      if (!lead) return json({ detail: 'Lead não encontrado' }, 404);
      return json({ lead, eventos: eventos.filter((e) => e.leadId === lead.id) });
    }
    if (metodo === 'POST' && partes.join('/') === 'leads/upsert') {
      const telefone = String(corpo?.telefone ?? '').replace(/\D/g, '');
      if (!/^55\d{10,11}$/.test(telefone)) {
        return json({ detail: 'Telefone obrigatório e válido' }, 400);
      }
      const atual = [...leads.values()].find((l) => l.telefone === telefone);
      const lead: LeadFalso = {
        ...(atual ?? { id: novoId(), etapa: 'novo' }),
        ...(corpo as Record<string, string>),
        telefone,
      };
      leads.set(lead.id, lead);
      return json(lead);
    }
    if (metodo === 'POST' && partes.length === 3 && partes[2] === 'eventos') {
      if (!leads.has(partes[1]!)) return json({ detail: 'Lead não encontrado' }, 404);
      eventos.push({ leadId: partes[1]!, texto: String(corpo?.texto ?? '') });
      return json({ ok: true });
    }
    return json({ detail: 'Not Found' }, 404);
  };

  return {
    token,
    fetch: buscar,
    leads,
    eventos,
    chamadas,
    estado,
    /** Lead já existente no CRM (prospectado antes). */
    semear(lead: Partial<LeadFalso> & { telefone: string }): LeadFalso {
      const completo = { id: novoId(), etapa: 'novo', ...lead } as LeadFalso;
      leads.set(completo.id, completo);
      return completo;
    },
    textosDe: (leadId: string) => eventos.filter((e) => e.leadId === leadId).map((e) => e.texto),
    /** só as chamadas que gravam (POST) */
    escritas: () => chamadas.filter((c) => c.metodo === 'POST'),
  };
}

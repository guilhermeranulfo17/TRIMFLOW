/*
 * API falsa do Asaas (só os endpoints que o Orkestra usa), em memória. Serve para os testes de
 * integração (como `fetch` injetado) e para o E2E (servidor HTTP em asaas-fake-servidor.ts).
 * Só sintaxe TypeScript "apagável": roda direto no Node 22 (node arquivo.ts).
 */

type Obj = Record<string, unknown>;

export type PagamentoFalso = {
  id: string;
  subscription: string | null;
  customer: string;
  value: number;
  status: string;
  dueDate: string;
  billingType: string;
  invoiceUrl: string;
  paymentDate: string | null;
  externalReference: string | null;
  deleted?: boolean;
};

export type OpcoesFalso = {
  /** chave esperada no header access_token */
  apiKey: string;
  /** base pública das páginas de fatura (ex.: http://localhost:4010) */
  urlPublica: string;
  /** para onde o "pagamento" manda o webhook e volta o navegador */
  app?: { url: string; webhookToken: string };
};

const hojeUtc = () => new Date().toISOString().slice(0, 10);

const somarMeses = (data: string, meses: number) => {
  const [a, m, d] = data.split('-').map(Number) as [number, number, number];
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
};

export function criarAsaasFalso(o: OpcoesFalso) {
  let seq = 0;
  // ids únicos entre instâncias (como no Asaas): eventos já gravados nunca colidem
  const instancia = Math.random().toString(36).slice(2, 8);
  const id = (p: string) => `${p}_${instancia}${++seq}`;
  const clientes = new Map<string, Obj>();
  const assinaturas = new Map<string, Obj>();
  const pagamentos = new Map<string, PagamentoFalso>();
  const webhooks: Obj[] = [];
  const chamadas: { metodo: string; caminho: string }[] = [];

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  function novoPagamento(d: {
    assinatura: string | null;
    cliente: string;
    valor: number;
    vencimento: string;
    referencia: string | null;
  }): PagamentoFalso {
    const pid = id('pay');
    const p: PagamentoFalso = {
      id: pid,
      subscription: d.assinatura,
      customer: d.cliente,
      value: d.valor,
      status: 'PENDING',
      dueDate: d.vencimento,
      billingType: 'UNDEFINED',
      invoiceUrl: `${o.urlPublica}/fatura/${pid}`,
      paymentDate: null,
      externalReference: d.referencia,
    };
    pagamentos.set(pid, p);
    return p;
  }

  async function enviarWebhook(evento: string, p: PagamentoFalso) {
    const corpo = {
      id: id('evt'),
      event: evento,
      dateCreated: new Date().toISOString(),
      payment: p,
    };
    webhooks.push(corpo);
    if (!o.app) return null;
    const r = await fetch(`${o.app.url}/api/cobranca/asaas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'asaas-access-token': o.app.webhookToken },
      body: JSON.stringify(corpo),
    });
    return r.status;
  }

  /** Marca a cobrança como recebida (e, se pago, cria a do próximo ciclo como o Asaas faz). */
  function pagar(pid: string, forma = 'PIX') {
    const p = pagamentos.get(pid);
    if (!p) throw new Error(`pagamento ${pid} não existe`);
    p.status = 'RECEIVED';
    p.billingType = forma;
    p.paymentDate = hojeUtc();
    const s = p.subscription ? assinaturas.get(p.subscription) : null;
    if (s && !s.deleted) {
      const meses = s.cycle === 'YEARLY' ? 12 : 1;
      const proximo = somarMeses(p.dueDate, meses);
      s.nextDueDate = proximo;
      novoPagamento({
        assinatura: String(s.id),
        cliente: String(s.customer),
        valor: Number(s.value),
        vencimento: proximo,
        referencia: (s.externalReference as string) ?? null,
      });
    }
    return p;
  }

  function vencer(pid: string) {
    const p = pagamentos.get(pid)!;
    p.status = 'OVERDUE';
    return p;
  }

  async function lerCorpo(req: Request): Promise<Obj> {
    const t = await req.text();
    return t ? (JSON.parse(t) as Obj) : {};
  }

  function paginaFatura(p: PagamentoFalso) {
    const valor = p.value.toFixed(2).replace('.', ',');
    return new Response(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Fatura (sandbox)</title></head><body style="font-family:sans-serif;padding:16px">
<h1>Fatura de teste</h1><p>Valor: R$ ${valor}</p><p>Vencimento: ${p.dueDate}</p><p>Status: ${p.status}</p>
<form method="post" action="/fatura/${p.id}/pagar"><button type="submit" data-testid="pagar-pix">Pagar com Pix</button></form>
</body></html>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }

  async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const caminho = url.pathname;
    const metodo = req.method.toUpperCase();

    // páginas públicas da fatura (navegador)
    let m = /^\/fatura\/([\w-]+)$/.exec(caminho);
    if (m && metodo === 'GET') {
      const p = pagamentos.get(m[1]!);
      return p ? paginaFatura(p) : new Response('não encontrada', { status: 404 });
    }
    m = /^\/fatura\/([\w-]+)\/pagar$/.exec(caminho);
    if (m && metodo === 'POST') {
      const p = pagar(m[1]!);
      await enviarWebhook('PAYMENT_RECEIVED', p);
      const volta = o.app ? `${o.app.url}/app/empresa/plano?pagamento=ok` : '/';
      return new Response(null, { status: 303, headers: { location: volta } });
    }
    if (caminho === '/saude') return json({ ok: true });

    if (!caminho.startsWith('/v3/')) return json({ errors: [{ code: 'not_found' }] }, 404);
    if (req.headers.get('access_token') !== o.apiKey) {
      return json({ errors: [{ code: 'invalid_access_token' }] }, 401);
    }
    chamadas.push({ metodo, caminho: caminho + url.search });
    const rota = caminho.slice(3);

    if (rota === '/customers' && metodo === 'POST') {
      const b = await lerCorpo(req);
      if (!b.name || !b.cpfCnpj) return json({ errors: [{ code: 'invalid_customer' }] }, 400);
      const c = { id: id('cus'), ...b };
      clientes.set(String(c.id), c);
      return json(c);
    }
    m = /^\/customers\/([\w-]+)$/.exec(rota);
    if (m && metodo === 'PUT') {
      const c = clientes.get(m[1]!);
      if (!c) return json({ errors: [{ code: 'not_found' }] }, 404);
      Object.assign(c, await lerCorpo(req));
      return json(c);
    }
    if (rota === '/subscriptions' && metodo === 'POST') {
      const b = await lerCorpo(req);
      if (!clientes.has(String(b.customer)))
        return json({ errors: [{ code: 'invalid_customer' }] }, 400);
      const s: Obj = { id: id('sub'), status: 'ACTIVE', ...b };
      assinaturas.set(String(s.id), s);
      novoPagamento({
        assinatura: String(s.id),
        cliente: String(b.customer),
        valor: Number(b.value),
        vencimento: String(b.nextDueDate),
        referencia: (b.externalReference as string) ?? null,
      });
      return json(s);
    }
    m = /^\/subscriptions\/([\w-]+)\/payments$/.exec(rota);
    if (m && metodo === 'GET') {
      const data = [...pagamentos.values()].filter((p) => p.subscription === m![1] && !p.deleted);
      return json({ object: 'list', totalCount: data.length, data });
    }
    m = /^\/subscriptions\/([\w-]+)$/.exec(rota);
    if (m && (metodo === 'PUT' || metodo === 'DELETE')) {
      const s = assinaturas.get(m[1]!);
      if (!s || s.deleted) return json({ errors: [{ code: 'not_found' }] }, 404);
      const pendentes = [...pagamentos.values()].filter(
        (p) => p.subscription === s.id && ['PENDING', 'OVERDUE'].includes(p.status),
      );
      if (metodo === 'DELETE') {
        s.deleted = true;
        s.status = 'INACTIVE';
        for (const p of pendentes) p.deleted = true;
        return json({ deleted: true, id: s.id });
      }
      const b = await lerCorpo(req);
      Object.assign(s, { value: b.value ?? s.value, cycle: b.cycle ?? s.cycle });
      if (b.updatePendingPayments) for (const p of pendentes) p.value = Number(s.value);
      return json(s);
    }
    if (rota === '/payments' && metodo === 'POST') {
      const b = await lerCorpo(req);
      if (!clientes.has(String(b.customer)))
        return json({ errors: [{ code: 'invalid_customer' }] }, 400);
      return json(
        novoPagamento({
          assinatura: null,
          cliente: String(b.customer),
          valor: Number(b.value),
          vencimento: String(b.dueDate),
          referencia: (b.externalReference as string) ?? null,
        }),
      );
    }
    m = /^\/payments\/([\w-]+)$/.exec(rota);
    if (m && metodo === 'GET') {
      const p = pagamentos.get(m[1]!);
      return p ? json(p) : json({ errors: [{ code: 'not_found' }] }, 404);
    }
    return json({ errors: [{ code: 'not_found' }] }, 404);
  }

  /** `fetch` para injetar no cliente (aceita só URLs da base configurada). */
  const fetchFalso = (async (entrada: RequestInfo | URL, init?: RequestInit) =>
    handler(new Request(entrada, init))) as typeof fetch;

  return {
    handler,
    fetch: fetchFalso,
    pagar,
    vencer,
    enviarWebhook,
    clientes,
    assinaturas,
    pagamentos,
    webhooks,
    chamadas,
  };
}

export type AsaasFalso = ReturnType<typeof criarAsaasFalso>;

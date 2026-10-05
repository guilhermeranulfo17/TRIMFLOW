/*
 * Servidor HTTP da API falsa do Asaas para o E2E (Playwright sobe com `node`).
 *   ASAAS_FAKE_PORTA (4010), ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, APP_URL
 */
import { createServer } from 'node:http';
import { criarAsaasFalso } from './asaas-fake.ts';

const porta = Number(process.env.ASAAS_FAKE_PORTA ?? 4010);
const urlPublica = `http://localhost:${porta}`;
const falso = criarAsaasFalso({
  apiKey: process.env.ASAAS_API_KEY ?? 'chave-falsa',
  urlPublica,
  app: {
    url: process.env.APP_URL ?? 'http://localhost:3000',
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN ?? 'token-falso',
  },
});

// E-mails do Resend (Etapa 10): o app aponta RESEND_API_URL para cá; o E2E lê o último
// e-mail de um destinatário (código do contrato) em GET /resend/ultimo?para=…
const emails = [];

createServer(async (req, res) => {
  const partes = [];
  for await (const c of req) partes.push(c);
  const corpo = Buffer.concat(partes);
  const url = new URL(req.url ?? '/', urlPublica);
  if (url.pathname === '/resend/emails' && req.method === 'POST') {
    const email = JSON.parse(corpo.toString() || '{}');
    emails.push({ ...email, chave: req.headers['idempotency-key'] ?? null });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: `email_${emails.length}` }));
    return;
  }
  if (url.pathname === '/resend/ultimo' && req.method === 'GET') {
    const para = url.searchParams.get('para');
    const achado = [...emails].reverse().find((e) => (e.to ?? []).includes(para));
    res.writeHead(achado ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(achado ?? null));
    return;
  }
  const cabecalhos = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') cabecalhos.set(k, v);
  }
  // formulário HTML da página de fatura chega como urlencoded: o handler ignora o corpo
  const resposta = await falso.handler(
    new Request(`${urlPublica}${req.url ?? '/'}`, {
      method: req.method,
      headers: cabecalhos,
      body: ['GET', 'HEAD'].includes(req.method ?? 'GET') || corpo.length === 0 ? undefined : corpo,
    }),
  );
  res.writeHead(resposta.status, Object.fromEntries(resposta.headers.entries()));
  res.end(Buffer.from(await resposta.arrayBuffer()));
}).listen(porta, () => console.log(`Asaas falso em ${urlPublica}`));

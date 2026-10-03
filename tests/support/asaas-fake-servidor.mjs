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

createServer(async (req, res) => {
  const partes = [];
  for await (const c of req) partes.push(c);
  const corpo = Buffer.concat(partes);
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

import { NextResponse, type NextRequest } from 'next/server';
import { configAsaas } from '@/server/cobranca/config';
import { tratarWebhook } from '@/server/cobranca/webhook';
import { obterDb } from '@/server/db/client';
import { dentroDoLimite } from '@/server/seguranca/limite';

/*
 * Webhook do Asaas (Configurações → Integrações → Webhooks, token em ASAAS_WEBHOOK_TOKEN).
 * Sem a configuração: 401 em tudo.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // B.2: IP que errou o token 20 vezes na hora fica bloqueado (o Asaas nunca erra o token)
  if (!(await dentroDoLimite('webhook', { registrar: false }))) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const config = configAsaas();
  const r = await tratarWebhook(obterDb(), {
    token: req.headers.get('asaas-access-token'),
    tokenEsperado: config?.webhookToken,
    corpo: await req.text(),
  });
  if (r.status === 401) await dentroDoLimite('webhook');
  return NextResponse.json(r.corpo, { status: r.status });
}

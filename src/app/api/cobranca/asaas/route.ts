import { NextResponse, type NextRequest } from 'next/server';
import { configAsaas } from '@/server/cobranca/config';
import { tratarWebhook } from '@/server/cobranca/webhook';
import { obterDb } from '@/server/db/client';

/*
 * Webhook do Asaas (Configurações → Integrações → Webhooks, token em ASAAS_WEBHOOK_TOKEN).
 * Sem a configuração: 401 em tudo.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const config = configAsaas();
  const r = await tratarWebhook(obterDb(), {
    token: req.headers.get('asaas-access-token'),
    tokenEsperado: config?.webhookToken,
    corpo: await req.text(),
  });
  return NextResponse.json(r.corpo, { status: r.status });
}

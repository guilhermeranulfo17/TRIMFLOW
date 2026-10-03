import { timingSafeEqual } from 'node:crypto';
import { after, NextResponse, type NextRequest } from 'next/server';
import { depsCobranca } from '@/server/cobranca/deps';
import { reconciliar } from '@/server/cobranca/fluxos';
import { cronSecret } from '@/server/env';

/*
 * Reconciliação diária com o Asaas. Chamada pelo pg_cron (pg_net) com
 * "Authorization: Bearer <CRON_SECRET>". Responde na hora e roda depois (after()).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function autorizado(req: NextRequest): boolean {
  const segredo = cronSecret();
  if (!segredo) return false;
  const a = Buffer.from(req.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${segredo}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const deps = depsCobranca();
  if (!deps) return NextResponse.json({ ok: false, motivo: 'COBRANCA_DESLIGADA' }, { status: 503 });
  after(async () => {
    const resumo = await reconciliar(deps);
    console.info('[cobranca] reconciliacao', JSON.stringify(resumo));
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}

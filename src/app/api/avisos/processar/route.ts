import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { processarAvisos } from '@/server/avisos/processar';
import { cronSecret } from '@/server/env';

/*
 * Processa a fila de avisos. Chamada a cada minuto pelo pg_cron (pg_net), com
 * "Authorization: Bearer <CRON_SECRET>". Sem o segredo certo: 401.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function autorizado(req: NextRequest): boolean {
  const segredo = cronSecret();
  if (!segredo) return false;
  const recebido = req.headers.get('authorization') ?? '';
  const esperado = `Bearer ${segredo}`;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const resumo = await processarAvisos();
  return NextResponse.json({ ok: true, ...resumo });
}

import { NextResponse, type NextRequest } from 'next/server';
import { processarAvisos } from '@/server/avisos/processar';
import { autorizadoPorCron } from '@/server/cron';

/*
 * Processa a fila de avisos. Chamada a cada minuto pelo pg_cron (pg_net), com
 * "Authorization: Bearer <CRON_SECRET>". Sem o segredo certo: 401 (e conta no limite, B.2).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await autorizadoPorCron(req))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const resumo = await processarAvisos();
  return NextResponse.json({ ok: true, ...resumo });
}

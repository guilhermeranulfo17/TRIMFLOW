import { after, NextResponse, type NextRequest } from 'next/server';
import { depsCobranca } from '@/server/cobranca/deps';
import { reconciliar } from '@/server/cobranca/fluxos';
import { autorizadoPorCron } from '@/server/cron';
import { logar } from '@/server/log';

/*
 * Reconciliação diária com o Asaas. Chamada pelo pg_cron (pg_net) com
 * "Authorization: Bearer <CRON_SECRET>". Responde na hora e roda depois (after()).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!(await autorizadoPorCron(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const deps = depsCobranca();
  if (!deps) return NextResponse.json({ ok: false, motivo: 'COBRANCA_DESLIGADA' }, { status: 503 });
  after(async () => {
    const resumo = await reconciliar(deps);
    logar('info', 'cobranca.reconciliacao', { ...resumo });
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}

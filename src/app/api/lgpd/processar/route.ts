import { after, NextResponse, type NextRequest } from 'next/server';
import { autorizadoPorCron } from '@/server/cron';
import { depsExclusao } from '@/server/lgpd/deps';
import { processarExclusoes } from '@/server/lgpd/exclusao';
import { logar } from '@/server/log';

/*
 * Exclusão definitiva das contas (LGPD, Etapa 9B). Chamada pelo pg_cron (pg_net) com
 * "Authorization: Bearer <CRON_SECRET>". Responde na hora e roda depois (after()).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!(await autorizadoPorCron(req))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  after(async () => {
    const r = await processarExclusoes(depsExclusao());
    logar(r.falhas.length ? 'erro' : 'info', 'lgpd.exclusao', {
      excluidas: r.excluidas.length,
      falhas: r.falhas.length,
    });
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}

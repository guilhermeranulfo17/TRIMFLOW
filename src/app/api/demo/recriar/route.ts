import { after, NextResponse, type NextRequest } from 'next/server';
import { autorizadoPorCron } from '@/server/cron';
import { depsDemo } from '@/server/demo/deps';
import { recriarDemo } from '@/server/demo/recriar';
import { codigoDoErro, logar } from '@/server/log';

/*
 * Recria a conta de demonstração (Etapa 9B, B.5) todo dia às 03:00 de Brasília. Chamada pelo
 * pg_cron (pg_net) com "Authorization: Bearer <CRON_SECRET>". Responde na hora e roda depois.
 * Sem NEXT_PUBLIC_DEMO_SLUG, não faz nada.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!(await autorizadoPorCron(req))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const deps = depsDemo();
  if (!deps) return NextResponse.json({ ok: true, demo: false });
  after(async () => {
    try {
      const r = await recriarDemo(deps);
      logar('info', 'demo.recriada', { empresa_id: r.empresaId, leads: r.leads });
    } catch (erro) {
      logar('erro', 'demo.recriar_falhou', { codigo: codigoDoErro(erro) });
    }
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}

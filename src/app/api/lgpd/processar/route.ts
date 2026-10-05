import { after, NextResponse, type NextRequest } from 'next/server';
import { autorizadoPorCron } from '@/server/cron';
import { depsExclusao } from '@/server/lgpd/deps';
import { processarExclusoes, removerPdfsAnonimizados } from '@/server/lgpd/exclusao';
import { codigoDoErro, logar } from '@/server/log';

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
    const deps = depsExclusao();
    const r = await processarExclusoes(deps);
    logar(r.falhas.length ? 'erro' : 'info', 'lgpd.exclusao', {
      excluidas: r.excluidas.length,
      falhas: r.falhas.length,
    });
    try {
      const pdfs = await removerPdfsAnonimizados(deps);
      if (pdfs) logar('info', 'lgpd.pdfs_contratos_removidos', { quantidade: pdfs });
    } catch (erro) {
      logar('erro', 'lgpd.pdfs_contratos_falhou', { codigo: codigoDoErro(erro) });
    }
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}

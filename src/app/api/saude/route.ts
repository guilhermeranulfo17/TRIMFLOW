import { NextResponse } from 'next/server';
import { logar } from '@/server/log';
import { depsSaude, verificarSaude } from '@/server/saude/verificar';

/*
 * Saúde do Orkestra para o monitor de disponibilidade (Etapa 9B, B.3): 200 com tudo certo, 503
 * com o item que falhou (banco, fila de avisos, jobs do pg_cron, Asaas, preços da landing).
 * Pública e sem dado sensível.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const saude = await verificarSaude(depsSaude());
  if (!saude.ok) {
    logar('aviso', 'saude.falha', {
      itens: saude.itens
        .filter((i) => !i.ok)
        .map((i) => i.item)
        .join(','),
    });
  }
  return NextResponse.json(saude, {
    status: saude.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

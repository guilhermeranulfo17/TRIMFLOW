import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { areaValida } from '@/domain/uso/areas';
import { usuarioAtual } from '@/server/auth/sessao';
import { comUsuario } from '@/server/db/tenant';
import { codigoDoErro, logar } from '@/server/log';

/*
 * Radar de uso (§92): o painel avisa qual área foi aberta e o banco soma 1 no dia da empresa.
 * Só a área (sem usuário, IP ou caminho completo). O modo suporte não conta. Nunca falha para
 * quem está usando o painel: qualquer erro vira 204 e um log com o código.
 */
export async function POST(req: Request) {
  let area: unknown;
  try {
    area = ((await req.json()) as { area?: unknown })?.area;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!areaValida(area)) return new NextResponse(null, { status: 400 });
  const usuario = await usuarioAtual();
  if (!usuario || usuario.suporte) return new NextResponse(null, { status: 204 });
  try {
    await comUsuario(usuario.id, (tx) => tx.execute(sql`select public.registrar_uso(${area})`));
  } catch (e) {
    logar('aviso', 'uso.registrar', { codigo: codigoDoErro(e) });
  }
  return new NextResponse(null, { status: 204 });
}

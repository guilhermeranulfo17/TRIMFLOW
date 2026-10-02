import { NextResponse } from 'next/server';
import { usuarioAtual } from '@/server/auth/sessao';
import { contarNaoLidos } from '@/server/avisos/carregar';

/** Contador do sino (o cliente consulta a cada 20 s e ao voltar para a aba). */
export const dynamic = 'force-dynamic';

export async function GET() {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ naoLidos: 0 }, { status: 401 });
  const naoLidos = await contarNaoLidos(usuario);
  return NextResponse.json({ naoLidos }, { headers: { 'Cache-Control': 'no-store' } });
}

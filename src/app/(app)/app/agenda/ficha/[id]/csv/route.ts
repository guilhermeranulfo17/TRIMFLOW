import { NextResponse } from 'next/server';
import { arquivoFicha, fichaEmCsv } from '@/domain/ficha/cozinha';
import { usuarioAtual } from '@/server/auth/sessao';
import { carregarFichaCozinha } from '@/server/ficha/carregar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ficha da cozinha em planilha (CSV com ";" e UTF-8 com BOM), sem preços. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) return new NextResponse('Entre para baixar a ficha.', { status: 401 });
  const dados = await carregarFichaCozinha(usuario, (await params).id);
  if (!dados) return new NextResponse('Reserva confirmada não encontrada.', { status: 404 });
  return new NextResponse(fichaEmCsv(dados.ficha), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': arquivoFicha(dados.cliente, dados.data, 'csv').contentDisposition,
      'Cache-Control': 'private, no-store',
    },
  });
}

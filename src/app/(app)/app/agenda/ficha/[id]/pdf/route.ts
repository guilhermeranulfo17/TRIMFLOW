import { NextResponse } from 'next/server';
import { arquivoFicha } from '@/domain/ficha/cozinha';
import { usuarioAtual } from '@/server/auth/sessao';
import { carregarFichaCozinha } from '@/server/ficha/carregar';
import { gerarPdfFicha } from '@/server/ficha/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ficha da cozinha em PDF, sem preços (RLS: só usuários da empresa da reserva). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) return new NextResponse('Entre para baixar a ficha.', { status: 401 });
  const dados = await carregarFichaCozinha(usuario, (await params).id);
  if (!dados) return new NextResponse('Reserva confirmada não encontrada.', { status: 404 });
  const pdf = await gerarPdfFicha(dados.ficha);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': arquivoFicha(dados.cliente, dados.data, 'pdf').contentDisposition,
      'Cache-Control': 'private, no-store',
    },
  });
}

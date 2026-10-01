import { NextResponse } from 'next/server';
import { usuarioAtual } from '@/server/auth/sessao';
import { montarPropostaExemplo } from '@/server/proposta/exemplo';
import { gerarPdfProposta } from '@/server/proposta/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PDF da proposta de exemplo (montada em memória; nada é gravado). */
export async function GET() {
  const usuario = await usuarioAtual();
  if (!usuario) return new NextResponse('Entre para ver o exemplo.', { status: 401 });
  const exemplo = await montarPropostaExemplo(usuario);
  if (!exemplo) return new NextResponse('Catálogo incompleto.', { status: 404 });
  const pdf = await gerarPdfProposta(exemplo.modelo);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Proposta de exemplo.pdf"',
      'Cache-Control': 'private, no-store',
    },
  });
}

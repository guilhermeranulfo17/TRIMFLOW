import { NextResponse } from 'next/server';
import { arquivoProposta } from '@/domain/proposta';
import { usuarioAtual } from '@/server/auth/sessao';
import { carregarPropostaDoPainel } from '@/server/proposta/carregar';
import { gerarPdfProposta } from '@/server/proposta/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PDF de qualquer versão, pelo painel (RLS: só da empresa do usuário). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) return new NextResponse('Entre para baixar a proposta.', { status: 401 });
  const proposta = await carregarPropostaDoPainel(usuario, (await params).id);
  if (!proposta) return new NextResponse('Proposta não encontrada.', { status: 404 });
  const pdf = await gerarPdfProposta(proposta.modelo);
  const arquivo = arquivoProposta({
    numero: proposta.versao.numero,
    buffet: proposta.buffet.nome,
    cliente: proposta.versao.clienteNome,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': arquivo.contentDisposition,
      'Cache-Control': 'private, no-store',
    },
  });
}

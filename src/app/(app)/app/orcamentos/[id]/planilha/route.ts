import { NextResponse } from 'next/server';
import { arquivoProposta, planilhaDaProposta } from '@/domain/proposta';
import { usuarioAtual } from '@/server/auth/sessao';
import { carregarPropostaDoPainel } from '@/server/proposta/carregar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Planilha de qualquer versão, pelo painel (RLS: só da empresa do usuário). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) return new NextResponse('Entre para baixar a planilha.', { status: 401 });
  const proposta = await carregarPropostaDoPainel(usuario, (await params).id);
  if (!proposta) return new NextResponse('Proposta não encontrada.', { status: 404 });
  const arquivo = arquivoProposta(
    {
      numero: proposta.versao.numero,
      buffet: proposta.buffet.nome,
      cliente: proposta.versao.clienteNome,
    },
    'csv',
  );
  return new NextResponse(planilhaDaProposta(proposta.modelo), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': arquivo.contentDisposition,
      'Cache-Control': 'private, no-store',
    },
  });
}

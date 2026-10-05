import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { arquivoContrato } from '@/domain/contratos/documento';
import { usuarioAtual } from '@/server/auth/sessao';
import { obterPdfContrato } from '@/server/contratos/arquivo';
import { identidadeDoBuffet, lerComprovante } from '@/server/contratos/carregar';
import { comUsuario } from '@/server/db/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PDF do contrato assinado, pelo painel (só o dono, só da própria empresa). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) return new NextResponse('Entre para baixar o contrato.', { status: 401 });
  const { id } = await params;
  if (usuario.perfil !== 'dono' || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse('Contrato não encontrado.', { status: 404 });
  }
  const dados = await comUsuario(usuario.id, async (tx) => {
    const [l] = await tx.execute<{ c: Record<string, unknown> | null }>(
      sql`select public.contrato_comprovante(${id}::uuid) as c`,
    );
    if (!l?.c) return null;
    return { c: lerComprovante(l.c), buffet: await identidadeDoBuffet(tx, usuario.empresa.id) };
  });
  if (!dados || !dados.buffet) return new NextResponse('Contrato não encontrado.', { status: 404 });
  const pdf = await obterPdfContrato(dados.c, dados.buffet, {
    marcar: async () => {
      await comUsuario(usuario.id, (tx) =>
        tx.execute(sql`select public.contrato_marcar_pdf(${id}::uuid)`),
      );
    },
  });
  const cliente = dados.c.assinaturas.find((a) => a.parte === 'cliente')?.nome;
  const arquivo = arquivoContrato({ codigo: dados.c.codigo, buffet: dados.buffet.nome, cliente });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': arquivo.contentDisposition,
      'Cache-Control': 'private, no-store',
    },
  });
}

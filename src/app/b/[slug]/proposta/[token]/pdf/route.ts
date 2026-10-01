import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { arquivoProposta } from '@/domain/proposta';
import { slugValido } from '@/domain/slug';
import { comAnon } from '@/server/db/anon';
import { carregarPropostaPublica } from '@/server/proposta/carregar';
import { gerarPdfProposta } from '@/server/proposta/pdf';
import { hashIpDoVisitante } from '@/server/publico/seguranca';

export const runtime = 'nodejs';
export const preferredRegion = 'gru1';
export const dynamic = 'force-dynamic';

const PROTECAO = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};

/** PDF da proposta (mesmos dados da web). Token antigo leva ao PDF da versão vigente. */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ slug: string; token: string }> },
) {
  const { slug, token } = await params;
  if (!slugValido(slug) || !/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    return new NextResponse('Proposta não encontrada.', { status: 404, headers: PROTECAO });
  }
  const ipHash = await hashIpDoVisitante();
  const [limite] = await comAnon((tx) =>
    tx.execute<{ ok: boolean }>(sql`select publico.limitar_pdf(${slug}, ${ipHash}) as ok`),
  );
  if (!limite?.ok) {
    return new NextResponse('Muitas tentativas. Tente de novo em alguns minutos.', {
      status: 429,
      headers: PROTECAO,
    });
  }
  const proposta = await carregarPropostaPublica(slug, token);
  if (!proposta)
    return new NextResponse('Proposta não encontrada.', { status: 404, headers: PROTECAO });
  if (proposta.meta.tokenAntigo) {
    return NextResponse.redirect(new URL(`/b/${slug}/proposta/${proposta.meta.token}/pdf`, _.url), {
      status: 307,
      headers: PROTECAO,
    });
  }
  const pdf = await gerarPdfProposta(proposta.modelo);
  const arquivo = arquivoProposta({
    numero: proposta.versao.numero,
    buffet: proposta.buffet.nome,
    cliente: proposta.versao.clienteNome,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      ...PROTECAO,
      'Content-Type': 'application/pdf',
      'Content-Disposition': arquivo.contentDisposition,
      'Content-Length': String(pdf.length),
    },
  });
}

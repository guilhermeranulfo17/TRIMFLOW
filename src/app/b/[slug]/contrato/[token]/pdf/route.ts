import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { arquivoContrato } from '@/domain/contratos/documento';
import { slugValido } from '@/domain/slug';
import { obterPdfContrato } from '@/server/contratos/arquivo';
import { carregarComprovantePublico } from '@/server/contratos/carregar';
import { REGEX_TOKEN_CONTRATO } from '@/server/contratos/segredos';
import { comAnon } from '@/server/db/anon';
import { lerBuffet } from '@/server/publico/carregar';
import { hashIpDoVisitante } from '@/server/publico/seguranca';

export const runtime = 'nodejs';
export const preferredRegion = 'gru1';
export const dynamic = 'force-dynamic';

const PROTECAO = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};

/** PDF do contrato assinado, pelo link do cliente (só concluído; limite por IP e contrato). */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ slug: string; token: string }> },
) {
  const { slug, token } = await params;
  const naoEncontrado = new NextResponse('Contrato não encontrado.', {
    status: 404,
    headers: PROTECAO,
  });
  if (!slugValido(slug) || !REGEX_TOKEN_CONTRATO.test(token)) return naoEncontrado;
  const c = await carregarComprovantePublico(slug, token, await hashIpDoVisitante());
  if (!c) return naoEncontrado;
  if (c === 'limite') {
    return new NextResponse('Muitas tentativas. Tente de novo em alguns minutos.', {
      status: 429,
      headers: PROTECAO,
    });
  }
  const buffet = await lerBuffet(slug);
  const pdf = await obterPdfContrato(
    c,
    {
      nome: buffet?.nome ?? '',
      logoUrl: buffet?.logoUrl ?? null,
      corMarca: buffet?.corMarca ?? null,
    },
    {
      marcar: async () => {
        await comAnon((tx) =>
          tx.execute(sql`select publico.contrato_marcar_pdf(${slug}, ${token})`),
        );
      },
    },
  );
  const cliente = c.assinaturas.find((a) => a.parte === 'cliente')?.nome;
  const arquivo = arquivoContrato({ codigo: c.codigo, buffet: buffet?.nome ?? '', cliente });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      ...PROTECAO,
      'Content-Type': 'application/pdf',
      'Content-Disposition': arquivo.contentDisposition,
      'Content-Length': String(pdf.length),
    },
  });
}

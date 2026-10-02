import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { linkComOrigem } from '@/domain/publico/origem';
import { usuarioAtual } from '@/server/auth/sessao';
import { empresas } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { qrPdf, qrPng } from '@/server/divulgacao/qr';
import { urlDoSite } from '@/server/env';
import { urlPublicaMidia } from '@/lib/midia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** QR code do link com ?origem=qrcode, em PNG (?formato=png) ou PDF A4 de impressão (?formato=pdf). */
export async function GET(req: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) return new NextResponse('Entre para baixar o QR code.', { status: 401 });
  const formato = new URL(req.url).searchParams.get('formato') === 'pdf' ? 'pdf' : 'png';
  const [empresa] = await comUsuario(usuario.id, (tx) =>
    tx
      .select({ nome: empresas.nome, slug: empresas.slug, logoPath: empresas.logoPath })
      .from(empresas)
      .where(eq(empresas.id, usuario.empresa.id)),
  );
  if (!empresa) return new NextResponse('Empresa não encontrada.', { status: 404 });
  const base = `${urlDoSite() ?? new URL(req.url).origin}/b/${empresa.slug}`;
  const texto = linkComOrigem(base, 'qrcode');
  const nome = `qrcode-${empresa.slug}.${formato}`;
  const cabecalhos = {
    'Content-Disposition': `attachment; filename="${nome}"`,
    'Cache-Control': 'private, no-store',
  };
  if (formato === 'png') {
    const png = await qrPng(texto);
    return new NextResponse(new Uint8Array(png), {
      headers: { ...cabecalhos, 'Content-Type': 'image/png' },
    });
  }
  const pdf = await qrPdf({
    texto,
    buffet: empresa.nome,
    logoUrl: urlPublicaMidia(empresa.logoPath),
    linkVisivel: base.replace(/^https?:\/\//, ''),
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { ...cabecalhos, 'Content-Type': 'application/pdf' },
  });
}

import { ImageResponse } from 'next/og';
import { coresDaMarca } from '@/domain/publico/cor';
import { lerBuffet } from '@/server/publico/carregar';

export const alt = 'Monte o orçamento da sua festa';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Imagem de compartilhamento (WhatsApp, Instagram): nome do buffet na cor da marca. */
export default async function ImagemCompartilhamento({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const buffet = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? await lerBuffet(slug) : null;
  const cores = coresDaMarca(buffet?.corMarca);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: cores.base,
        color: cores.texto,
      }}
    >
      <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }}>
        {buffet?.nome ?? 'Orkestra'}
      </div>
      <div style={{ fontSize: 40, marginTop: 24, opacity: 0.9 }}>
        Monte o orçamento da sua festa em poucos minutos
      </div>
    </div>,
    size,
  );
}

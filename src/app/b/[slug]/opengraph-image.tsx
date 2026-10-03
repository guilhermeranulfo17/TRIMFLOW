import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { coresDaMarca } from '@/domain/publico/cor';
import { slugValido } from '@/domain/slug';
import { lerBuffet } from '@/server/publico/carregar';

export const alt = 'Monte o orçamento da sua festa';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// a imagem muda quando o dono troca capa, logo ou cor: uma hora de cache basta
export const revalidate = 3600;

/** Baixa a imagem (WEBP no Storage) e devolve um data URL PNG/JPEG que o gerador entende. */
async function comoDataUrl(
  url: string | null,
  largura: number,
  altura: number,
  formato: 'jpeg' | 'png',
): Promise<string | null> {
  if (!url) return null;
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!resposta.ok) return null;
    const imagem = sharp(Buffer.from(await resposta.arrayBuffer())).resize(largura, altura, {
      fit: 'cover',
    });
    const buffer =
      formato === 'jpeg'
        ? await imagem.jpeg({ quality: 80 }).toBuffer()
        : await imagem.png().toBuffer();
    return `data:image/${formato};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Imagem de compartilhamento (WhatsApp, Instagram), 1200x630: capa com degradê na cor do
 * buffet, logo, nome e cidade. Sem capa, fundo na cor do buffet.
 */
export default async function ImagemCompartilhamento({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const buffet = slugValido(slug) ? await lerBuffet(slug) : null;
  const cores = coresDaMarca(buffet?.corMarca);
  const [capa, logo] = await Promise.all([
    comoDataUrl(buffet?.capaUrl ?? null, 1200, 630, 'jpeg'),
    comoDataUrl(buffet?.logoUrl ?? null, 240, 240, 'png'),
  ]);
  const cidade = buffet?.cidade ? `${buffet.cidade}${buffet.uf ? ` - ${buffet.uf}` : ''}` : null;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: cores.destaque,
        color: '#FFFFFF',
      }}
    >
      {capa && (
        <img
          src={capa}
          alt=""
          width={1200}
          height={630}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            objectFit: 'cover',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          display: 'flex',
          background: capa
            ? `linear-gradient(90deg, ${cores.destaque} 0%, ${cores.destaque}E6 45%, ${cores.destaque}33 100%)`
            : `linear-gradient(135deg, ${cores.destaque} 0%, ${cores.base} 100%)`,
        }}
      />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          width: 820,
        }}
      >
        {logo && (
          <img
            src={logo}
            alt=""
            width={120}
            height={120}
            style={{ borderRadius: 999, border: '6px solid #FFFFFF', marginBottom: 32 }}
          />
        )}
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05 }}>
          {buffet?.nome ?? 'Orkestra'}
        </div>
        {cidade && <div style={{ fontSize: 36, marginTop: 16, opacity: 0.92 }}>{cidade}</div>}
        <div
          style={{
            display: 'flex',
            marginTop: 36,
            fontSize: 30,
            fontWeight: 700,
            background: '#FFFFFF',
            color: cores.destaque,
            padding: '14px 28px',
            borderRadius: 999,
            alignSelf: 'flex-start',
          }}
        >
          Monte o orçamento da sua festa
        </div>
      </div>
    </div>,
    size,
  );
}

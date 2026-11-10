import { ImageResponse } from 'next/og';
import { LOGOTIPO, svgDoLogotipo } from '@/components/marca/logotipo';

export const alt = 'Orkestra: seu cliente monta o orçamento sozinho.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Imagem de compartilhamento da landing (1200x630): preto, brilho limão, logotipo e a promessa. */
export default function Imagem() {
  const logo = `data:image/svg+xml;base64,${Buffer.from(svgDoLogotipo('#F4F4EE')).toString('base64')}`;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        color: '#F4F4EE',
        backgroundColor: '#0A0A0A',
        backgroundImage:
          'radial-gradient(circle at 12% 8%, rgba(192,240,90,0.28), transparent 45%), radial-gradient(circle at 95% 95%, rgba(192,240,90,0.16), transparent 45%)',
      }}
    >
      <img
        src={logo}
        width={380}
        height={Math.round((380 * LOGOTIPO.altura) / LOGOTIPO.largura)}
        alt=""
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }}>
          Seu cliente monta o orçamento sozinho.
        </div>
        <div style={{ fontSize: 40, color: '#C0F05A', fontWeight: 700 }}>
          E o pedido chega pronto no seu WhatsApp.
        </div>
      </div>
      <div style={{ fontSize: 28, opacity: 0.75 }}>
        Para buffets de festas. 14 dias grátis, sem cartão.
      </div>
    </div>,
    size,
  );
}

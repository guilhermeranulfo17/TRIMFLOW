import { ImageResponse } from 'next/og';
import { svgDoSimbolo } from '@/components/marca/simbolo';

export const alt =
  'Orkestra: o cliente monta o orçamento sozinho. Você só entra quando ele quer reservar.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Imagem de compartilhamento da landing (1200x630): grafite, brilho limão, símbolo e a promessa. */
export default function Imagem() {
  const simbolo = `data:image/svg+xml;base64,${Buffer.from(svgDoSimbolo('#F7F6F2')).toString('base64')}`;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        color: '#F7F6F2',
        backgroundColor: '#0C0C0C',
        backgroundImage:
          'radial-gradient(circle at 12% 8%, rgba(62,228,46,0.28), transparent 45%), radial-gradient(circle at 95% 95%, rgba(62,228,46,0.16), transparent 45%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <img src={simbolo} width={88} height={88} alt="" />
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -1 }}>Orkestra</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }}>
          O cliente monta o orçamento sozinho.
        </div>
        <div style={{ fontSize: 40, color: '#3EE42E', fontWeight: 700 }}>
          Você só entra quando ele quer reservar.
        </div>
      </div>
      <div style={{ fontSize: 28, opacity: 0.75 }}>Link de orçamento para buffets de festas</div>
    </div>,
    size,
  );
}

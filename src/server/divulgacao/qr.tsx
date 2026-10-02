import 'server-only';
import {
  Document,
  Image,
  Page,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import sharp from 'sharp';
import { encode } from 'uqr';
// importar o PDF da proposta registra a fonte Manrope e reaproveita a conversão do logo
import { logoEmPng } from '@/server/proposta/pdf';

/*
 * QR code do link (Link e divulgação): a matriz vem do `uqr` (sem dependências, só no servidor);
 * aqui só desenhamos. PNG pelo sharp a partir de um SVG; PDF A4 de impressão pelo react-pdf.
 * Correção de erro "M" e borda de 2 módulos (zona de silêncio pedida pelos leitores).
 */

function matriz(texto: string): boolean[][] {
  return encode(texto, { ecc: 'M', border: 2 }).data;
}

/** SVG com um <path> por linha de módulos pretos (leve e nítido em qualquer tamanho). */
export function qrSvg(texto: string, pixel = 8): string {
  const m = matriz(texto);
  const n = m.length;
  let d = '';
  m.forEach((linha, y) => {
    linha.forEach((preto, x) => {
      if (preto) d += `M${x * pixel} ${y * pixel}h${pixel}v${pixel}h-${pixel}z`;
    });
  });
  const lado = n * pixel;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** PNG do QR (~1.000 px de lado). */
export async function qrPng(texto: string): Promise<Buffer> {
  const n = matriz(texto).length;
  const pixel = Math.max(4, Math.floor(1000 / n));
  return sharp(Buffer.from(qrSvg(texto, pixel)))
    .png()
    .toBuffer();
}

const est = StyleSheet.create({
  pagina: { fontFamily: 'Manrope', padding: 48, alignItems: 'center', color: '#16141F' },
  logo: { width: 96, height: 96, borderRadius: 16, marginBottom: 16 },
  buffet: { fontSize: 20, fontWeight: 600, marginBottom: 28, textAlign: 'center' },
  titulo: { fontSize: 34, fontWeight: 800, textAlign: 'center', marginBottom: 10 },
  subtitulo: { fontSize: 15, color: '#5F5B6E', textAlign: 'center', marginBottom: 32 },
  link: { fontSize: 14, fontWeight: 600, marginTop: 24, textAlign: 'center' },
  rodape: { position: 'absolute', bottom: 32, fontSize: 10, color: '#5F5B6E' },
});

/** Cartaz A4: título, nome e logo do buffet, QR grande e o link escrito embaixo. */
export async function qrPdf(o: {
  texto: string;
  buffet: string;
  logoUrl: string | null;
  linkVisivel: string;
}) {
  const m = matriz(o.texto);
  const n = m.length;
  const lado = 340; // pt (~12 cm)
  const modulo = lado / n;
  const logo = await logoEmPng(o.logoUrl);
  return renderToBuffer(
    <Document title={`QR code - ${o.buffet}`}>
      <Page size="A4" style={est.pagina}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
        {logo && <Image src={logo} style={est.logo} />}
        <Text style={est.buffet}>{o.buffet}</Text>
        <Text style={est.titulo}>Monte o orçamento da sua festa</Text>
        <Text style={est.subtitulo}>
          Aponte a câmera do celular, escolha a data e veja o preço na hora.
        </Text>
        <View>
          <Svg width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`}>
            <Rect x={0} y={0} width={lado} height={lado} fill="#FFFFFF" />
            {m.flatMap((linha, y) =>
              linha.map((preto, x) =>
                preto ? (
                  <Rect
                    key={`${x}-${y}`}
                    x={x * modulo}
                    y={y * modulo}
                    width={modulo + 0.2}
                    height={modulo + 0.2}
                    fill="#000000"
                  />
                ) : null,
              ),
            )}
          </Svg>
        </View>
        <Text style={est.link}>{o.linkVisivel}</Text>
        <Text style={est.rodape}>feito com Orkestra</Text>
      </Page>
    </Document>,
  );
}

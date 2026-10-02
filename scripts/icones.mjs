// Gera os ícones do PWA a partir de um SVG (rode uma vez: node scripts/icones.mjs).
import sharp from 'sharp';

const svg = (tamanho, margem) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0c0c0c"/>
  <circle cx="256" cy="256" r="${256 - margem}" fill="#3ee42e"/>
  <text x="256" y="256" text-anchor="middle" dominant-baseline="central"
        font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${(256 - margem) * 1.15}"
        fill="#0c0c0c">O</text>
</svg>`;

const saidas = [
  ['public/icones/icone-192.png', 192, 56],
  ['public/icones/icone-512.png', 512, 56],
  ['public/icones/icone-maskable-512.png', 512, 110],
  ['src/app/apple-icon.png', 180, 40],
];
for (const [arquivo, tamanho, margem] of saidas) {
  await sharp(Buffer.from(svg(tamanho, margem)))
    .resize(tamanho, tamanho)
    .png()
    .toFile(arquivo);
  console.log(arquivo);
}

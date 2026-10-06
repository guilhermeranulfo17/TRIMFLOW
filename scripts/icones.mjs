// Gera os ícones do PWA a partir do símbolo (rode uma vez: node scripts/icones.mjs).
// Fundo limão de ponta a ponta e o "O" do logotipo em preto; no maskable, o "O" menor (zona segura).
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const fonte = readFileSync('src/components/marca/simbolo.tsx', 'utf8');
const O = /const O =\s*'([^']+)'/.exec(fonte)[1];

const svg = (escala) => {
  const lado = 100 * escala;
  const d = (100 - lado) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#B2F759"/>
  <path transform="translate(${d} ${d}) scale(${escala})" fill="#0C0C0C" fill-rule="evenodd" d="${O}"/>
</svg>`;
};

const saidas = [
  ['public/icones/icone-192.png', 192, 0.56],
  ['public/icones/icone-512.png', 512, 0.56],
  ['public/icones/icone-maskable-512.png', 512, 0.44],
  ['src/app/apple-icon.png', 180, 0.56],
  ['src/app/icon.png', 48, 0.62],
];
for (const [arquivo, tamanho, escala] of saidas) {
  await sharp(Buffer.from(svg(escala)), { density: 600 })
    .resize(tamanho, tamanho)
    .png()
    .toFile(arquivo);
  console.log(arquivo);
}

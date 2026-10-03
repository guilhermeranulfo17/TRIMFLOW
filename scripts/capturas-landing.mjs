// Etapa 9.6 · Capturas da vitrine para a landing ("Sua página, sua cara"): o Buffet Demo nos 3
// estilos (festivo, elegante, limpo), no celular, em WebP de 640 e 1280 px em public/landing/.
//
// Só roda no ambiente local (banco e app em localhost). As imagens do seed (capa, galeria,
// pacotes) são geradas aqui mesmo, como em scripts/seed-midia.mjs, e servidas interceptando o
// Storage: não precisa do Storage local.
//
// Uso: com o app de pé (pnpm build && pnpm start) e o seed aplicado:
//   node --env-file-if-exists=.env.local scripts/capturas-landing.mjs
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import postgres from 'postgres';
import sharp from 'sharp';

const BASE = process.env.CAPTURAS_URL ?? 'http://localhost:3000';
const BANCO = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const DEMO = '11111111-1111-4111-8111-111111111111';
const ESTILOS = ['festivo', 'elegante', 'limpo'];
const SAIDA = 'public/landing';

if (!/127\.0\.0\.1|localhost/.test(BASE) || !/127\.0\.0\.1|localhost/.test(BANCO)) {
  console.error('Este script só roda no ambiente local.');
  process.exit(1);
}

const uuidDe = (texto) => {
  const h = createHash('md5').update(texto).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const PALETAS = [
  ['#0F766E', '#F59E0B', '#FDE68A'],
  ['#BE185D', '#FB7185', '#FFE4E6'],
  ['#1D4ED8', '#38BDF8', '#E0F2FE'],
  ['#15803D', '#A3E635', '#ECFCCB'],
  ['#B45309', '#FCD34D', '#FEF3C7'],
  ['#0E7490', '#F472B6', '#FCE7F3'],
];

/** Mesma ilustração abstrata do seed-midia (degradê, bolhas e confetes), determinística. */
function svg(largura, altura, semente) {
  const [a, b, c] = PALETAS[semente % PALETAS.length];
  let n = semente * 9301 + 49297;
  const rnd = () => (n = (n * 9301 + 49297) % 233280) / 233280;
  const bolhas = Array.from({ length: 14 }, () => {
    const r = 20 + rnd() * altura * 0.18;
    return `<circle cx="${rnd() * largura}" cy="${rnd() * altura}" r="${r}" fill="${[b, c, '#fff'][Math.floor(rnd() * 3)]}" opacity="${0.15 + rnd() * 0.35}"/>`;
  }).join('');
  const confetes = Array.from({ length: 40 }, () => {
    const x = rnd() * largura;
    const y = rnd() * altura;
    return `<rect x="${x}" y="${y}" width="${6 + rnd() * 10}" height="${3 + rnd() * 5}" rx="2" fill="${[b, c, '#fff'][Math.floor(rnd() * 3)]}" transform="rotate(${rnd() * 180} ${x} ${y})" opacity="0.8"/>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <filter id="f"><feGaussianBlur stdDeviation="${Math.round(largura / 120)}"/></filter></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <g filter="url(#f)">${bolhas}</g>${confetes}
  </svg>`);
}

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const sql = postgres(BANCO, { max: 1, onnotice: () => {} });
const navegador = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);

try {
  // capa e fotos dos pacotes com os mesmos caminhos do seed-midia (só se ainda não tiver)
  const capa = `${DEMO}/capa/${uuidDe('seed:capa')}.webp`;
  await sql`update public.empresas set capa_path = coalesce(capa_path, ${capa}) where id = ${DEMO}`;
  const pacotes =
    await sql`select id from public.pacotes where empresa_id = ${DEMO} order by ordem`;
  for (const p of pacotes) {
    const fotos = [0, 1].map((k) => `${DEMO}/pacotes/${uuidDe(`seed:pacote:${p.id}:${k}`)}.webp`);
    await sql`update public.pacotes set fotos = ${sql.json(fotos)}
      where id = ${p.id} and coalesce(jsonb_array_length(fotos), 0) = 0`;
  }
  const [{ original }] =
    await sql`select estilo as original from public.empresas where id = ${DEMO}`;
  await mkdir(SAIDA, { recursive: true });

  for (const estilo of ESTILOS) {
    await sql`update public.empresas set estilo = ${estilo} where id = ${DEMO}`;
    // a vitrine fica 60 s em cache: espera vencer, pede uma vez (refaz) e captura em seguida
    await espera(61_000);
    const contexto = await navegador.newContext({
      viewport: { width: 390, height: 780 },
      deviceScaleFactor: 3.3,
    });
    const pagina = await contexto.newPage();
    await pagina.route('**/storage/v1/object/public/midia/**', async (rota) => {
      const caminho = new URL(rota.request().url()).pathname;
      const semente = parseInt(createHash('md5').update(caminho).digest('hex').slice(0, 6), 16);
      const [l, a] = caminho.includes('/capa/') ? [1920, 840] : [1280, 960];
      const corpo = await sharp(svg(l, a, semente))
        .webp({ quality: 78 })
        .toBuffer();
      await rota.fulfill({ status: 200, contentType: 'image/webp', body: corpo });
    });
    await pagina.goto(`${BASE}/b/buffet-demo`, { waitUntil: 'networkidle' });
    await espera(2_000);
    await pagina.goto(`${BASE}/b/buffet-demo`, { waitUntil: 'networkidle' });
    await pagina.emulateMedia({ reducedMotion: 'reduce' });
    await espera(800);
    const png = await pagina.screenshot({ type: 'png' });
    for (const largura of [640, 1280]) {
      await sharp(png)
        .resize(largura, largura * 2, { fit: 'cover', position: 'top' })
        .webp({ quality: 72 })
        .toFile(`${SAIDA}/vitrine-${estilo}-${largura}.webp`);
    }
    console.log(`vitrine ${estilo}: ok`);
    await contexto.close();
  }
  await sql`update public.empresas set estilo = ${original} where id = ${DEMO}`;
} finally {
  await navegador.close();
  await sql.end();
}

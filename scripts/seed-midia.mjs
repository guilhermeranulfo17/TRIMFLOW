// Etapa 9.5 · Imagens do seed (só desenvolvimento local): capa, galeria e fotos dos pacotes do
// Buffet Demo, geradas aqui mesmo com sharp (ilustrações abstratas, nada de foto de terceiros)
// e enviadas ao Storage local. As linhas da galeria já vêm do seed.sql com estes caminhos.
//
// Uso: pnpm db:seed:midia   (precisa do Supabase local e de SUPABASE_SERVICE_ROLE_KEY)
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import sharp from 'sharp';

const DEMO = '11111111-1111-4111-8111-111111111111';
const API = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BANCO = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

if (!CHAVE) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY (veja `pnpm exec supabase status`).');
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(API) || !/127\.0\.0\.1|localhost/.test(BANCO)) {
  console.error('Este script só roda no Supabase local.');
  process.exit(1);
}

/** md5(texto)::uuid, igual ao Postgres. */
function uuidDe(texto) {
  const h = createHash('md5').update(texto).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const PALETAS = [
  ['#0F766E', '#F59E0B', '#FDE68A'],
  ['#BE185D', '#FB7185', '#FFE4E6'],
  ['#1D4ED8', '#38BDF8', '#E0F2FE'],
  ['#15803D', '#A3E635', '#ECFCCB'],
  ['#B45309', '#FCD34D', '#FEF3C7'],
  ['#0E7490', '#F472B6', '#FCE7F3'],
];

/** Ilustração abstrata de festa (degradê, bolhas de luz e confetes), determinística. */
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

async function webp(largura, altura, semente) {
  return sharp(svg(largura, altura, semente))
    .webp({ quality: 80 })
    .toBuffer();
}

async function enviar(caminho, corpo) {
  const r = await fetch(`${API}/storage/v1/object/midia/${caminho}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CHAVE}`,
      apikey: CHAVE,
      'Content-Type': 'image/webp',
      'x-upsert': 'true',
      'cache-control': '31536000',
    },
    body: corpo,
  });
  if (!r.ok) throw new Error(`upload ${caminho}: ${r.status} ${await r.text()}`);
}

const sql = postgres(BANCO, { max: 1, onnotice: () => {} });
try {
  // galeria: os caminhos do seed.sql
  const fotos = await sql`select caminho_640, caminho_1280, largura, altura, ordem
    from public.galeria_fotos where empresa_id = ${DEMO} order by ordem`;
  for (const f of fotos) {
    const semente = f.ordem + 1;
    await enviar(f.caminho_1280, await webp(f.largura, f.altura, semente));
    await enviar(f.caminho_640, await webp(640, Math.round((640 * f.altura) / f.largura), semente));
    const mini = await sharp(svg(16, Math.round((16 * f.altura) / f.largura), semente))
      .webp({ quality: 50 })
      .toBuffer();
    await sql`update public.galeria_fotos set blur = ${`data:image/webp;base64,${mini.toString('base64')}`}
      where caminho_1280 = ${f.caminho_1280}`;
  }

  // capa (1920x840) e fotos dos pacotes (2 por pacote, 1600x1200)
  const capa = `${DEMO}/capa/${uuidDe('seed:capa')}.webp`;
  await enviar(capa, await webp(1920, 840, 7));
  await sql`update public.empresas set capa_path = ${capa} where id = ${DEMO}`;

  const pacotes =
    await sql`select id from public.pacotes where empresa_id = ${DEMO} order by ordem`;
  let i = 0;
  for (const p of pacotes) {
    const caminhos = [];
    for (const k of [0, 1]) {
      const c = `${DEMO}/pacotes/${uuidDe(`seed:pacote:${p.id}:${k}`)}.webp`;
      await enviar(c, await webp(1600, 1200, 10 + i * 2 + k));
      caminhos.push(c);
    }
    await sql`update public.pacotes set fotos = ${sql.json(caminhos)} where id = ${p.id}`;
    i += 1;
  }
  console.log(
    `Mídia do seed enviada: capa, ${fotos.length} fotos da galeria e ${pacotes.length} pacotes.`,
  );
} finally {
  await sql.end();
}

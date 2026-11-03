// Imagens do "Buffet Estrela" (seed do vídeo de vendas, supabase/seed-video.sql). Só local.
// Logo, capa e fotos dos pacotes geradas aqui com sharp (ilustrações, nada de foto de terceiros).
//
// Uso: node --env-file=.env.local scripts/seed-video-midia.mjs
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import sharp from 'sharp';

const EST = 'e5000000-0000-4000-8000-000000000001';
const API = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BANCO = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!CHAVE) throw new Error('Defina SUPABASE_SERVICE_ROLE_KEY.');
if (!/127\.0\.0\.1|localhost/.test(API) || !/127\.0\.0\.1|localhost/.test(BANCO)) {
  throw new Error('Este script só roda no Supabase local.');
}

const uuidDe = (t) => {
  const h = createHash('md5').update(t).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

function estrela(cx, cy, r, ri, cor, extra = '') {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? ri : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return `<polygon points="${pts}" fill="${cor}" stroke-linejoin="round" ${extra}/>`;
}

const PALETAS = [
  ['#F97316', '#FDBA74', '#FFF7ED'],
  ['#EA580C', '#FACC15', '#FEF9C3'],
  ['#DB2777', '#FDA4AF', '#FFE4E6'],
  ['#0EA5E9', '#7DD3FC', '#E0F2FE'],
  ['#F59E0B', '#FDE68A', '#FFFBEB'],
  ['#16A34A', '#86EFAC', '#F0FDF4'],
  ['#E11D48', '#FB923C', '#FFEDD5'],
];

function cena(w, h, s) {
  const [a, b, c] = PALETAS[s % PALETAS.length];
  let n = s * 9301 + 49297;
  const rnd = () => (n = (n * 9301 + 49297) % 233280) / 233280;
  const bolhas = Array.from(
    { length: 12 },
    () =>
      `<circle cx="${rnd() * w}" cy="${rnd() * h}" r="${20 + rnd() * h * 0.2}" fill="${[b, c, '#fff'][Math.floor(rnd() * 3)]}" opacity="${0.15 + rnd() * 0.3}"/>`,
  ).join('');
  const estrelas = Array.from({ length: 16 }, () => {
    const r = 8 + rnd() * h * 0.05;
    return estrela(
      rnd() * w,
      rnd() * h,
      r,
      r * 0.45,
      ['#fff', c, b][Math.floor(rnd() * 3)],
      `opacity="${0.5 + rnd() * 0.5}"`,
    );
  }).join('');
  const confetes = Array.from({ length: 36 }, () => {
    const x = rnd() * w,
      y = rnd() * h;
    return `<rect x="${x}" y="${y}" width="${6 + rnd() * 10}" height="${3 + rnd() * 5}" rx="2" fill="${[b, c, '#fff'][Math.floor(rnd() * 3)]}" transform="rotate(${rnd() * 180} ${x} ${y})" opacity="0.85"/>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <filter id="f"><feGaussianBlur stdDeviation="${Math.round(w / 110)}"/></filter></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><g filter="url(#f)">${bolhas}</g>${confetes}${estrelas}</svg>`);
}

const logo = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F97316"/><stop offset="1" stop-color="#E11D48"/></linearGradient></defs>
  <circle cx="256" cy="256" r="256" fill="url(#g)"/>
  ${estrela(256, 268, 170, 74, '#FFFFFF')}
  ${estrela(388, 132, 30, 13, '#FDE68A')}${estrela(132, 120, 18, 8, '#FDE68A')}
</svg>`);

async function enviar(caminho, corpo) {
  const r = await fetch(`${API}/storage/v1/object/midia/${caminho}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CHAVE}`,
      apikey: CHAVE,
      'Content-Type': 'image/webp',
      'x-upsert': 'true',
    },
    body: corpo,
  });
  if (!r.ok) throw new Error(`upload ${caminho}: ${r.status} ${await r.text()}`);
}
const webp = (svg, q = 85) => sharp(svg).webp({ quality: q }).toBuffer();

const sql = postgres(BANCO, { max: 1, onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    await tx`select set_config('orkestra.permitir_escrita', '1', true)`;
    const lg = `${EST}/logo/${uuidDe('video:logo')}.webp`;
    await enviar(lg, await webp(logo, 92));
    const capa = `${EST}/capa/${uuidDe('video:capa')}-1920.webp`;
    await enviar(capa, await webp(cena(1920, 840, 6)));
    await enviar(capa.replace(/-1920\.webp$/, '-960.webp'), await webp(cena(960, 420, 6)));
    await tx`update public.empresas set logo_path = ${lg}, capa_path = ${capa}, cor_marca = '#E8590C' where id = ${EST}`;
    const pacotes =
      await tx`select id from public.pacotes where empresa_id = ${EST} order by ordem`;
    let i = 0;
    for (const p of pacotes) {
      const caminhos = [];
      for (const k of [0, 1]) {
        const c = `${EST}/pacotes/${uuidDe(`video:pacote:${p.id}:${k}`)}.webp`;
        await enviar(c, await webp(cena(1600, 1200, i * 2 + k)));
        caminhos.push(c);
      }
      await tx`update public.pacotes set fotos = ${tx.json(caminhos)} where id = ${p.id}`;
      i += 1;
    }
  });
  console.log('Mídia do Buffet Estrela enviada.');
} finally {
  await sql.end();
}

// Imagens do "Buffet Estrela" (seed do vídeo de vendas, supabase/seed-video.sql). Só local.
// Logo gerado aqui com sharp; capa e fotos dos pacotes são fotos reais CC0 em scripts/midia-video
// (origem de cada uma em scripts/midia-video/CREDITOS.txt).
//
// Uso: node --env-file=.env.local scripts/seed-video-midia.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
const FOTOS = new URL('./midia-video/', import.meta.url);
/** Foto real recortada no tamanho pedido (cover), em WEBP. */
const foto = (nome, w, h) =>
  sharp(readFileSync(new URL(nome, FOTOS)))
    .resize(w, h, { fit: 'cover', position: 'attention' })
    .webp({ quality: 88 })
    .toBuffer();
const NOMES_PACOTES = ['alegria', 'super', 'encanto'];

const sql = postgres(BANCO, { max: 1, onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    await tx`select set_config('orkestra.permitir_escrita', '1', true)`;
    const lg = `${EST}/logo/${uuidDe('video:logo')}.webp`;
    await enviar(lg, await webp(logo, 92));
    const capa = `${EST}/capa/${uuidDe('video:capa')}-1920.webp`;
    await enviar(capa, await foto('capa.jpg', 1920, 840));
    await enviar(capa.replace(/-1920\.webp$/, '-960.webp'), await foto('capa.jpg', 960, 420));
    await tx`update public.empresas set logo_path = ${lg}, capa_path = ${capa}, cor_marca = '#E8590C' where id = ${EST}`;
    const pacotes =
      await tx`select id from public.pacotes where empresa_id = ${EST} order by ordem`;
    let i = 0;
    for (const p of pacotes) {
      const caminhos = [];
      for (const k of [0, 1]) {
        const c = `${EST}/pacotes/${uuidDe(`video:pacote-foto:${p.id}:${k}`)}.webp`;
        await enviar(c, await foto(`${NOMES_PACOTES[i]}-${k + 1}.jpg`, 1600, 1200));
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

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

/*
 * Etapa 9.5 (B): o roxo saiu da identidade. Falha se a paleta antiga ou classes roxas voltarem ao
 * código, aos arquivos públicos, aos e-mails do Auth ou aos seeds. As migrations antigas ficam de
 * fora: são histórico e não podem ser editadas (a 20261010000002 troca o padrão).
 */

const RAIZ = process.cwd();
const PROIBIDAS = /#(?:7c5cd6|6a4bc4|3d2f73|f1eefb)\b/i;
const CLASSES_ROXAS =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration)-(?:violet|purple|fuchsia)-\d/;
const TEXTO = new Set([
  '.ts',
  '.tsx',
  '.css',
  '.html',
  '.svg',
  '.json',
  '.sql',
  '.mjs',
  '.webmanifest',
]);

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

const ALVOS = [
  ...arquivos(join(RAIZ, 'src')),
  ...arquivos(join(RAIZ, 'public')),
  ...arquivos(join(RAIZ, 'supabase/templates')),
  join(RAIZ, 'supabase/seed.sql'),
  join(RAIZ, 'supabase/seed-volume.sql'),
].filter((f) => TEXTO.has(extname(f)));

describe('sem roxo', () => {
  it('nenhuma cor da paleta antiga nem classe roxa no código, públicos, e-mails e seeds', () => {
    const achados = ALVOS.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((linha, i) => ({ linha, i }))
        .filter(({ linha }) => PROIBIDAS.test(linha) || CLASSES_ROXAS.test(linha))
        .map(({ i }) => `${f.slice(RAIZ.length + 1)}:${i + 1}`),
    );
    expect(achados).toEqual([]);
  });

  it.each(['public/icones/icone-192.png', 'public/icones/icone-512.png', 'src/app/apple-icon.png'])(
    'ícone %s sem pixels roxos',
    async (arquivo) => {
      const { data, info } = await sharp(join(RAIZ, arquivo))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let roxos = 0;
      for (let p = 0; p < data.length; p += info.channels) {
        const [r, g, b] = [data[p]!, data[p + 1]!, data[p + 2]!];
        // azul e vermelho bem acima do verde = tom roxo/magenta
        if (b > g + 40 && r > g + 20) roxos++;
      }
      expect(roxos).toBe(0);
    },
  );
});

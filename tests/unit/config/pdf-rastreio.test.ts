import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Na Vercel cada rota leva só os arquivos que o rastreio do Next encontra. A Manrope (lida do
 * disco) e as fontes padrão do pdfkit (require dinâmico dentro do @react-pdf/renderer) ficavam de
 * fora e todo PDF dava erro 500 em produção, mesmo com o CI verde. Este teste confere que toda
 * rota que gera PDF está em ROTAS_PDF do next.config.ts e que os arquivos incluídos existem.
 */

const RAIZ = process.cwd();
const APP = join(RAIZ, 'src/app');
const CONFIG = readFileSync(join(RAIZ, 'next.config.ts'), 'utf8');

/** Módulos que geram PDF (ou chamam quem gera), como aparecem nos imports das rotas. */
const GERAM_PDF = [
  '@/server/proposta/pdf',
  '@/server/contratos/pdf',
  '@/server/contratos/arquivo',
  '@/server/divulgacao/qr',
  '@/server/actions/contrato-publico',
];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

/** src/app/(app)/app/orcamentos/[id]/pdf/route.ts → /app/orcamentos/[id]/pdf */
function rota(arquivo: string): string {
  const partes = relative(APP, arquivo)
    .split(sep)
    .slice(0, -1)
    .filter((p) => !/^\(.*\)$/.test(p));
  return `/${partes.join('/')}`;
}

function lista(nome: string): string[] {
  const m = new RegExp(`const ${nome} = \\[([\\s\\S]*?)\\];`).exec(CONFIG);
  if (!m) throw new Error(`${nome} não encontrado no next.config.ts`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

describe('PDF no deploy (rastreio de arquivos)', () => {
  it('toda rota que gera PDF está em ROTAS_PDF', () => {
    const rotas = arquivos(APP)
      .filter((c) => /[/\\](route\.ts|page\.tsx)$/.test(c))
      .filter((c) => {
        const texto = readFileSync(c, 'utf8');
        return GERAM_PDF.some((m) => texto.includes(`'${m}'`));
      })
      .map(rota)
      .sort();
    expect(rotas.length).toBeGreaterThan(0);
    const configuradas = lista('ROTAS_PDF');
    expect(rotas.filter((r) => !configuradas.includes(r))).toEqual([]);
    expect(CONFIG).toContain('Object.fromEntries(ROTAS_PDF.map((r) => [r, ARQUIVOS_PDF]))');
  });

  it('os arquivos incluídos existem (fontes da proposta e fontes padrão do pdfkit)', () => {
    const globs = lista('ARQUIVOS_PDF');
    expect(globs).toContain('./src/server/proposta/fontes/**');
    expect(existsSync(join(RAIZ, 'src/server/proposta/fontes/Manrope-400.ttf'))).toBe(true);
    const pdfkit = globs.find((g) => g.includes('pdfkit'));
    expect(pdfkit).toBeDefined();
    // o glob tem que achar a versão instalada (subir o pdfkit muda a pasta do pnpm)
    const pnpm = join(RAIZ, 'node_modules/.pnpm');
    const pastas = readdirSync(pnpm).filter((p) => p.startsWith('pdfkit@'));
    expect(pastas.length).toBeGreaterThan(0);
    for (const p of pastas) {
      expect(existsSync(join(pnpm, p, 'node_modules/pdfkit/js/standard-fonts/Helvetica.cjs'))).toBe(
        true,
      );
    }
  });
});

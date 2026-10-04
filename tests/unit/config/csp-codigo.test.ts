import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Etapa 9B (B.2): o que já quebrou a CSP com nonce não volta.
 * - next/dynamic emite um <link rel="preload"> sem nonce (Next 15): use React.lazy + Suspense;
 * - o zod do navegador roda sem JIT (alias no next.config).
 */
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe('código compatível com a CSP', () => {
  it('nenhum next/dynamic em src', () => {
    const usam = arquivos('src').filter((f) => readFileSync(f, 'utf8').includes("'next/dynamic'"));
    expect(usam).toEqual([]);
  });

  it('o navegador usa o zod sem JIT', () => {
    expect(readFileSync('next.config.ts', 'utf8')).toContain(
      "zod$: path.join(process.cwd(), 'src/lib/zod-sem-jit.ts')",
    );
    expect(readFileSync('src/lib/zod-sem-jit.ts', 'utf8')).toContain('z.config({ jitless: true })');
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Etapa 9B (B.2): o que já quebrou a CSP com nonce não volta.
 * - next/dynamic emite um <link rel="preload"> sem nonce (Next 15): use React.lazy + Suspense;
 * - o zod do navegador roda sem JIT (global ligado no instrumentation-client).
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

  it('o navegador liga o zod sem JIT antes do app (sem importar o zod)', () => {
    const cliente = readFileSync('src/instrumentation-client.ts', 'utf8');
    expect(cliente).toContain('__zod_globalConfig');
    expect(cliente).toContain('jitless: true');
    expect(cliente).not.toMatch(/from 'zod/);
    // o zod continua lendo a configuração desse global
    expect(readFileSync('node_modules/zod/v4/core/core.js', 'utf8')).toContain(
      'globalThis.__zod_globalConfig',
    );
  });
});

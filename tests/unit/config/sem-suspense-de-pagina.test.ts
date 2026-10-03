import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Etapa 9.5 (correção do PR 1, ARQUITETURA §60): no painel, Suspense em volta do conteúdo da
 * página (um loading.tsx ou um <Suspense> no page.tsx) fazia a tela às vezes não trocar depois de
 * uma ação com revalidatePath/router.refresh: a resposta chegava com os dados novos e a tela ficava
 * com os antigos (o "Fiz" do checklist e o logo em Minha empresa, no CI). Suspense só no layout.
 */

const RAIZ = process.cwd();
const PAINEL = ['src/app/(app)', 'src/app/(onboarding)'].map((d) => join(RAIZ, d));

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

const todos = PAINEL.flatMap(arquivos).map((c) => relative(RAIZ, c).split(sep).join('/'));

describe('painel sem Suspense de página', () => {
  it('nenhum loading.tsx', () => {
    expect(todos.filter((c) => c.endsWith('/loading.tsx'))).toEqual([]);
  });

  it('nenhum <Suspense> dentro de page.tsx', () => {
    const comSuspense = todos
      .filter((c) => c.endsWith('/page.tsx'))
      .filter((c) => /<Suspense\b/.test(readFileSync(join(RAIZ, c), 'utf8')));
    expect(comSuspense).toEqual([]);
  });
});

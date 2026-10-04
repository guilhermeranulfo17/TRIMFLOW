import type { Page } from '@playwright/test';

/**
 * Coleta violações de CSP da página (Etapa 9B, B.2): o evento securitypolicyviolation de cada
 * documento vira uma linha no console, e as mensagens do próprio Chrome ("Refused to …
 * Content Security Policy") também entram. Devolve a lista acumulada entre navegações.
 */
export async function vigiarCsp(page: Page): Promise<() => string[]> {
  const violacoes: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(
        `[violacao-csp] ${e.violatedDirective} ${e.blockedURI || '(inline)'} em ${location.pathname}`,
      );
    });
  });
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[violacao-csp]') || /Content Security Policy/i.test(t)) violacoes.push(t);
  });
  return () => [...new Set(violacoes)];
}

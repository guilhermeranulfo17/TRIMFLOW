import { expect, type Page } from '@playwright/test';
import { noBanco } from './banco';

export const SENHA_SEED = 'demo12345';

export function emailUnico(prefixo = 'e2e'): string {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@exemplo.test`;
}

export async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/leads$/);
}

export async function sair(page: Page) {
  await page.getByRole('button', { name: /Menu do usuário/ }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function cadastrar(
  page: Page,
  dados: {
    nome: string;
    email: string;
    whatsapp: string;
    senha: string;
    buffet: string;
    segmento: string;
  },
) {
  await page.goto('/cadastro');
  await page.getByLabel('Seu nome').fill(dados.nome);
  await page.getByLabel('E-mail').fill(dados.email);
  await page.getByLabel('WhatsApp').fill(dados.whatsapp);
  await page.getByLabel('Senha', { exact: true }).fill(dados.senha);
  await page.getByLabel('Nome do buffet').fill(dados.buffet);
  await page.getByRole('radio', { name: dados.segmento }).check();
  await page.getByRole('checkbox', { name: /aceito os termos/ }).check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
}

export async function semRolagemHorizontal(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

/**
 * Depois do cadastro (que já aplica o modelo do segmento com preços de EXEMPLO), confirma os
 * preços pelo onboarding (passo 3, digitando o valor de exemplo de cada pacote) e termina.
 * Sem isso o link público fica "finalizando" (nenhum pacote com preço confirmado).
 */
export async function confirmarPrecosNoOnboarding(page: Page) {
  await page.goto('/app/comecar?passo=3');
  await expect(page.getByTestId('passo-onboarding')).toHaveText('Passo 3 de 5');
  const pacotes = page.getByTestId('preco-pacote');
  await expect(pacotes.first()).toBeVisible();
  for (const p of await pacotes.all()) {
    const exemplo = (await p.getByText(/^Exemplo: /).innerText()).replace('Exemplo: R$', '').trim();
    await p.getByRole('textbox').first().fill(exemplo);
  }
  await page.getByRole('button', { name: 'Confirmar preços e continuar' }).click();
  await expect(page.getByTestId('passo-onboarding')).toHaveText('Passo 4 de 5');
  await page.getByTestId('continuar-onboarding').click();
  await expect(page.getByTestId('passo-onboarding')).toHaveText('Passo 5 de 5');
}

/** Para testes que montam o catálogo do zero: apaga o catálogo que o cadastro trouxe. */
export async function esvaziarCatalogo(email: string) {
  await noBanco(async (sql) => {
    const [u] = await sql<{ empresa_id: string }[]>`
      select empresa_id from public.usuarios where email = ${email}`;
    const e = u!.empresa_id;
    await sql`delete from public.opcionais where empresa_id = ${e}`;
    await sql`delete from public.pacotes where empresa_id = ${e}`;
    await sql`delete from public.faixas_idade where empresa_id = ${e}`;
    await sql`delete from public.ajustes_dia where empresa_id = ${e}`;
    await sql`delete from public.turnos where empresa_id = ${e}`;
    await sql`delete from public.espacos where empresa_id = ${e}`;
    await sql`delete from public.tipos_evento where empresa_id = ${e}`;
    await sql`delete from public.faixas_deslocamento where empresa_id = ${e}`;
  });
}

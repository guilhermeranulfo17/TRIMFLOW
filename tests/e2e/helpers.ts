import { expect, type Page } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Criar conta' }).click();
}

export async function semRolagemHorizontal(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

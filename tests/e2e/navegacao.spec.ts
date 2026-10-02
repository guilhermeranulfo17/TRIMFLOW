import { expect, test } from '@playwright/test';
import { entrar, SENHA_SEED, semRolagemHorizontal } from './helpers';

type Area = {
  rotulo: string;
  url: RegExp;
  titulo: string;
  vazio?: string;
  botao?: string;
  lista?: string;
};

const AREAS: Area[] = [
  // A agenda do Buffet Demo já tem eventos (seed): confere o botão principal em vez do vazio.
  { rotulo: 'Agenda', url: /\/app\/agenda$/, titulo: 'Agenda', botao: 'Registrar evento' },
  // Números do Buffet Demo vêm do seed (Etapa 8): confere os cartões.
  { rotulo: 'Números', url: /\/app\/numeros$/, titulo: 'Números', lista: 'cartoes-numeros' },
  {
    rotulo: 'Minha empresa',
    url: /\/app\/empresa$/,
    titulo: 'Minha empresa',
    vazio: 'Identidade do buffet',
  },
  // Os leads do Buffet Demo vêm do seed (Etapa 4): confere a lista.
  { rotulo: 'Leads', url: /\/app\/leads$/, titulo: 'Leads', lista: 'lista-leads' },
];

test('navega pelas 4 áreas sem rolagem horizontal', async ({ page }) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  await expect(page.getByTestId('nome-buffet')).toHaveText('Buffet Demo');

  const nav = page.getByRole('navigation', { name: 'Principal' });
  await expect(nav).toBeVisible();

  for (const area of AREAS) {
    await nav.getByRole('link', { name: area.rotulo }).click();
    await expect(page).toHaveURL(area.url);
    await expect(page.getByRole('heading', { name: area.titulo, level: 1 })).toBeVisible();
    if (area.vazio) {
      await expect(page.getByRole('heading', { name: area.vazio })).toBeVisible();
    } else if (area.lista) {
      await expect(page.getByTestId(area.lista)).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: area.botao! })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: area.rotulo })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await semRolagemHorizontal(page)).toBe(true);
  }

  // "+ Orçamento" leva ao orçamento interno (e some dentro dele).
  const botao = page.getByRole('link', { name: 'Novo orçamento' });
  await expect(botao).toBeVisible();
  await botao.click();
  await expect(page).toHaveURL(/\/app\/orcamentos\/novo$/);
  await expect(page.getByRole('heading', { name: 'Novo orçamento', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Novo orçamento' })).toHaveCount(0);
  expect(await semRolagemHorizontal(page)).toBe(true);
});

test('vendedor vê o mesmo painel com o próprio nome no menu', async ({ page }) => {
  await entrar(page, 'vendedor@demo.local', SENHA_SEED);
  await page.getByRole('button', { name: /Menu do usuário Vendedor Demo/ }).click();
  await expect(page.getByRole('menu')).toContainText('Vendedor');
});

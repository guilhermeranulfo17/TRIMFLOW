import { expect, test } from '@playwright/test';
import { entrar, SENHA_SEED, semRolagemHorizontal } from './helpers';

const AREAS = [
  // A agenda do Buffet Demo já tem eventos (seed): confere o botão principal em vez do vazio.
  { rotulo: 'Agenda', url: /\/app\/agenda$/, titulo: 'Agenda', botao: 'Registrar evento' },
  {
    rotulo: 'Números',
    url: /\/app\/numeros$/,
    titulo: 'Números',
    vazio: 'Seu link está trazendo reservas?',
  },
  {
    rotulo: 'Minha empresa',
    url: /\/app\/empresa$/,
    titulo: 'Minha empresa',
    vazio: 'Identidade do buffet',
  },
  { rotulo: 'Leads', url: /\/app\/leads$/, titulo: 'Leads', vazio: 'Sua caixa de leads' },
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
    if ('vazio' in area) {
      await expect(page.getByRole('heading', { name: area.vazio })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: area.botao })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: area.rotulo })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await semRolagemHorizontal(page)).toBe(true);
  }

  const botao = page.getByRole('button', { name: /Novo orçamento/ });
  await expect(botao).toBeVisible();
  await expect(botao).toBeDisabled();
});

test('vendedor vê o mesmo painel com o próprio nome no menu', async ({ page }) => {
  await entrar(page, 'vendedor@demo.local', SENHA_SEED);
  await page.getByRole('button', { name: /Menu do usuário Vendedor Demo/ }).click();
  await expect(page.getByRole('menu')).toContainText('Vendedor');
});

import { expect, test } from '@playwright/test';
import { cadastrar, emailUnico, entrar, SENHA_SEED, semRolagemHorizontal } from './helpers';

test.describe('simulador de preço', () => {
  test('dono sem catálogo carrega o modelo de exemplo e simula', async ({ page }) => {
    await cadastrar(page, {
      nome: 'Carla Dias',
      email: emailUnico('simulador'),
      whatsapp: '34991355450',
      senha: 'senha-forte-123',
      buffet: 'Buffet Simulado',
      segmento: 'Buffet infantil',
    });
    await expect(page).toHaveURL(/\/app\/leads$/);

    await page.goto('/app/empresa/catalogo');
    await page.getByRole('link', { name: 'Testar preços' }).click();
    await expect(page).toHaveURL(/\/app\/empresa\/simulador$/);
    await expect(
      page.getByRole('heading', { name: 'Seu catálogo ainda está vazio' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Carregar modelo de exemplo' }).click();
    const pacote = page.getByLabel('Pacote');
    await expect(pacote).toBeVisible();
    await expect(pacote.locator('option')).toHaveText(['Alegria', 'Super ★', 'Encanto']);

    await page.getByRole('button', { name: 'Calcular preço' }).click();
    await expect(page.getByTestId('total-orcamento')).toContainText('R$');
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('simula uma festa do Buffet Demo e vê o total na tela', async ({ page }) => {
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    await page.goto('/app/empresa/simulador');

    await page.getByLabel('Adultos').fill('60');
    await page.getByLabel('Crianças 6 a 10 anos').fill('10');
    await page.getByLabel('Pacote').selectOption({ label: 'Super ★' });
    await page.getByLabel('Mesa temática').fill('1');
    await page.getByRole('button', { name: 'Calcular preço' }).click();

    // 65 equivalentes → faixa até 80 (R$ 6.500,00) + sábado 10% (R$ 650,00) + mesa (R$ 600,00)
    await expect(page.getByTestId('total-orcamento')).toContainText('R$ 7.750,00');
    const linhas = page.getByRole('list', { name: 'Linhas do orçamento' });
    await expect(linhas).toContainText('65 convidados equivalentes: faixa até 80');
    await expect(linhas).toContainText('Ajuste sábado');
    await expect(page.getByText('Orçamento válido.')).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('vendedor não acessa o simulador', async ({ page }) => {
    await entrar(page, 'vendedor@demo.local', SENHA_SEED);
    await page.goto('/app/empresa/catalogo');
    await expect(page.getByRole('link', { name: 'Testar preços' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Simulador' })).toHaveCount(0);

    await page.goto('/app/empresa/simulador');
    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calcular preço' })).toHaveCount(0);
  });
});

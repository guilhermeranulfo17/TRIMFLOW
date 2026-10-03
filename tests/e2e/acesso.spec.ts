import { expect, test } from '@playwright/test';
import { semRolagemHorizontal } from './helpers';

/*
 * Etapa 9.5 (C): telas de acesso no PC (1440) e no celular (390), botão do Google (a ida ao
 * Supabase é interceptada: confere provider e redirect_to) e mensagem de erro igual para e-mail
 * inexistente e senha errada (não revela quem tem conta).
 */

test.describe('no PC (1440)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('login mostra a promessa do produto ao lado do formulário', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Orçamento que vira/ })).toBeVisible();
    await expect(page.getByText('Você só entra quando ele quer reservar.')).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeFocused();
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('"Continuar com o Google" vai ao Supabase com provider=google e volta no callback', async ({
    page,
  }) => {
    let ida: URL | undefined;
    await page.route('**/auth/v1/authorize**', async (rota) => {
      ida = new URL(rota.request().url());
      await rota.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google</p>' });
    });
    await page.goto('/login?next=/app/agenda');
    await page.getByRole('button', { name: 'Continuar com o Google' }).click();
    await expect.poll(() => ida?.searchParams.get('provider')).toBe('google');
    const volta = new URL(ida!.searchParams.get('redirect_to')!);
    expect(volta.pathname).toBe('/auth/callback');
    expect(volta.searchParams.get('next')).toBe('/app/agenda');
  });

  test('cadastro com Google leva ao onboarding depois do callback', async ({ page }) => {
    let ida: URL | undefined;
    await page.route('**/auth/v1/authorize**', async (rota) => {
      ida = new URL(rota.request().url());
      await rota.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google</p>' });
    });
    await page.goto('/cadastro');
    await page.getByRole('button', { name: 'Continuar com o Google' }).click();
    await expect.poll(() => ida?.searchParams.get('provider')).toBe('google');
    expect(new URL(ida!.searchParams.get('redirect_to')!).searchParams.get('next')).toBe(
      '/app/comecar',
    );
  });
});

test.describe('no celular (390)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('login só com o formulário, sem rolagem lateral', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Orçamento que vira/ })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Continuar com o Google' })).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('mesma mensagem para e-mail inexistente e senha errada', async ({ page }) => {
    const mensagens: string[] = [];
    for (const [email, senha] of [
      ['ninguem-aqui@exemplo.test', 'qualquer-senha-1'],
      ['dono@demo.local', 'senha-errada-1'],
    ]) {
      await page.goto('/login');
      await page.getByLabel('E-mail').fill(email!);
      await page.getByLabel('Senha', { exact: true }).fill(senha!);
      await page.getByLabel('Senha', { exact: true }).press('Enter');
      const aviso = page.getByTestId('aviso-form');
      await expect(aviso).toBeVisible();
      mensagens.push((await aviso.innerText()).trim());
    }
    expect(mensagens[0]).toBe('E-mail ou senha incorretos.');
    expect(mensagens[1]).toBe(mensagens[0]);
  });

  test('cadastro: força da senha e aceite dos termos obrigatório', async ({ page }) => {
    await page.goto('/cadastro');
    await expect(page.getByLabel('Seu nome')).toBeFocused();
    await page.getByLabel('Senha', { exact: true }).fill('festa2026');
    await expect(page.getByTestId('forca-senha')).toContainText('Senha fraca');
    await page.getByLabel('Senha', { exact: true }).fill('Buffet da Ana 2026');
    await expect(page.getByTestId('forca-senha')).toContainText('Senha forte');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText('Para criar a conta, aceite os termos de uso.')).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('/cadastro/completar sem sessão vai para o login', async ({ page }) => {
    await page.goto('/cadastro/completar');
    await expect(page).toHaveURL(/\/login/);
  });

  test('callback sem code volta ao login com aviso do Google', async ({ page }) => {
    await page.goto('/auth/callback');
    await expect(page).toHaveURL(/\/login\?erro=google$/);
    await expect(page.getByTestId('aviso-form')).toContainText('Google');
  });
});

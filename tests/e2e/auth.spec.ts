import { expect, test } from '@playwright/test';
import { cadastrar, emailUnico, entrar, sair, SENHA_SEED, semRolagemHorizontal } from './helpers';

test.describe('acesso', () => {
  test('/app sem sessão redireciona para o login', async ({ page }) => {
    await page.goto('/app/agenda');
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fagenda$/);
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  });

  test('login com senha errada mostra mensagem simples', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill('dono@demo.local');
    await page.getByLabel('Senha', { exact: true }).fill('senha-errada');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByTestId('aviso-form')).toHaveText('E-mail ou senha incorretos.');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login volta para a página pedida antes (next)', async ({ page }) => {
    await page.goto('/app/numeros');
    await page.getByLabel('E-mail').fill('vendedor@demo.local');
    await page.getByLabel('Senha', { exact: true }).fill(SENHA_SEED);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/app\/numeros$/);
  });
});

test.describe('cadastro', () => {
  test('valida campos em português', async ({ page }) => {
    await page.goto('/cadastro');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText('Informe seu nome')).toBeVisible();
    await expect(page.getByText('Informe seu WhatsApp')).toBeVisible();
    await expect(page.getByText('Escolha o tipo de buffet')).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('máscara de WhatsApp na digitação', async ({ page }) => {
    await page.goto('/cadastro');
    await page.getByLabel('WhatsApp').pressSequentially('34991355450');
    await expect(page.getByLabel('WhatsApp')).toHaveValue('(34) 99135-5450');
  });

  test('cadastro completo, logout e login', async ({ page }) => {
    const email = emailUnico('cadastro');
    const senha = 'senha-forte-123';

    await cadastrar(page, {
      nome: 'Ana Souza',
      email,
      whatsapp: '34991355450',
      senha,
      buffet: 'Buffet Alegria & Cia',
      segmento: 'Buffet infantil',
    });
    // a conta nasce com o modelo do segmento e cai no onboarding
    await expect(page).toHaveURL(/\/app\/comecar$/);
    await expect(page.getByTestId('passo-onboarding')).toHaveText('Passo 1 de 5');
    await page.goto('/app/leads');
    await expect(page.getByTestId('nome-buffet')).toHaveText('Buffet Alegria & Cia');
    await expect(page.getByRole('heading', { name: 'Leads', level: 1 })).toBeVisible();
    await expect(page.getByTestId('faixa-onboarding')).toContainText('passo 1 de 5');

    // Logado não volta para o login
    await page.goto('/login');
    await expect(page).toHaveURL(/\/app\/leads$/);

    await sair(page);
    await page.goto('/app/leads');
    await expect(page).toHaveURL(/\/login\?next=/);

    await entrar(page, email, senha);
    await expect(page.getByTestId('nome-buffet')).toHaveText('Buffet Alegria & Cia');
  });

  test('e-mail já cadastrado mostra mensagem simples', async ({ page }) => {
    await cadastrar(page, {
      nome: 'Outra Pessoa',
      email: 'dono@demo.local',
      whatsapp: '34991355450',
      senha: 'senha-forte-123',
      buffet: 'Buffet Qualquer',
      segmento: 'Casamento e eventos',
    });
    await expect(page.getByTestId('aviso-form')).toContainText(
      'Já existe uma conta com esse e-mail',
    );
  });
});

test.describe('página pública', () => {
  test('mostra o nome do buffet pelo slug', async ({ page }) => {
    await page.goto('/b/buffet-demo');
    await expect(page.getByRole('heading', { name: 'Buffet Demo', level: 1 })).toBeVisible();
    await expect(page.getByText('contato@demo.local')).toHaveCount(0);
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('slug inexistente mostra 404 amigável', async ({ page }) => {
    const resposta = await page.goto('/b/esse-buffet-nao-existe');
    expect(resposta?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Buffet não encontrado' })).toBeVisible();
  });
});

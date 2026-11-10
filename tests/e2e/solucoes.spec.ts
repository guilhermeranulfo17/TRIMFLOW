import { expect, test } from '@playwright/test';
import { noBanco } from './banco';
import { cadastrar, emailUnico, entrar, SENHA_SEED, semRolagemHorizontal } from './helpers';

/*
 * Nossas soluções: catálogo e detalhe, recusas para o vendedor, e o fluxo pago do OrkMargem
 * com a API falsa do Asaas (fatura → webhook → ativo → cancelar). Em série: o fluxo pago liga a
 * venda do OrkMargem no banco local e desliga no fim.
 */

test.describe.configure({ mode: 'serial' });

test('dono vê as seis soluções, sem venda pública, e o detalhe explica a solução', async ({
  page,
}) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  await page.goto('/app/solucoes');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Mais possibilidades para o seu buffet',
  );
  await expect(page.locator('[data-testid^="cartao-"]')).toHaveCount(6);
  await expect(page.getByTestId('cartao-orkmargem')).toContainText('R$ 149,00 por mês');
  await expect(page.getByTestId('cartao-orkpass')).toContainText('R$ 29,00 por festa');
  await expect(page.getByTestId('acao-orkmargem')).toHaveText('Conhecer solução');
  expect(await semRolagemHorizontal(page)).toBe(true);

  await page.getByTestId('aba-minhas').click();
  await expect(page.getByText('Nenhuma solução contratada')).toBeVisible();

  await page.goto('/app/solucoes/orkmargem');
  await expect(page.getByTestId('indisponivel')).toBeVisible();
  await expect(
    page.getByText('Margem de contribuição não é lucro líquido', { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByTestId('demonstracao')).toContainText('Dados fictícios');
  // sem venda liberada, a tela de contratar volta para o detalhe
  await page.goto('/app/solucoes/orkmargem/contratar');
  await expect(page).toHaveURL(/\/app\/solucoes\/orkmargem$/);
});

test('vendedor vê o catálogo, mas não contrata nem abre o OrkMargem', async ({ page }) => {
  await entrar(page, 'vendedor@demo.local', SENHA_SEED);
  await page.goto('/app/solucoes');
  await expect(page.locator('[data-testid^="cartao-"]')).toHaveCount(6);
  await expect(page.getByText('Só o dono do buffet contrata e cancela.')).toBeVisible();
  for (const url of ['/app/solucoes/orkmargem/contratar', '/app/margem']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
  }
});

test('OrkMargem: contratar, voltar sem pagar, pagar (webhook), usar e cancelar', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await noBanco(
    (sql) => sql`update public.modulos set venda_liberada = true where codigo = 'orkmargem'`,
  );
  try {
    await cadastrar(page, {
      nome: 'Dona Soluções',
      email: emailUnico('solucoes'),
      whatsapp: '34991355450',
      senha: 'senha-boa-123',
      buffet: `Buffet Soluções ${Date.now()}`,
    });
    await expect(page).toHaveURL(/\/app\/comecar/);
    await page.goto('/app/solucoes');
    await expect(page.getByTestId('acao-orkmargem')).toHaveText('Contratar');
    await page.getByTestId('acao-orkmargem').click();
    await expect(page.getByTestId('resumo-compra')).toContainText('R$ 149,00');
    await page.getByLabel('Nome ou razão social').fill('Dona Soluções');
    await page.getByLabel('CPF ou CNPJ').fill('52998224725');
    await page.getByLabel('E-mail').fill('dona@solucoes.test');
    await page.getByTestId('aceite-compra').check();
    const [fatura] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByTestId('confirmar-compra').click(),
    ]);
    await expect(fatura).toHaveURL(/localhost:4010\/fatura\//);

    // voltar do checkout não libera nada
    await page.goto('/app/solucoes/orkmargem');
    await expect(page.getByTestId('situacao-solucao')).toHaveText('Pagamento pendente');
    await page.goto('/app/margem');
    await expect(page.getByTestId('chamada-orkmargem')).toBeVisible();

    // paga na fatura: o Asaas falso manda o webhook ao app
    await fatura.getByTestId('pagar-pix').click();
    await expect(async () => {
      await page.goto('/app/solucoes/orkmargem');
      await expect(page.getByTestId('situacao-solucao')).toHaveText('Ativo', { timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId('acao-detalhe')).toHaveText('Configurar');
    await page.goto('/app/solucoes?aba=minhas');
    await expect(page.locator('[data-testid^="cartao-"]')).toHaveCount(1);

    // primeiro uso: custos do pacote
    await page.goto('/app/margem?aba=pacotes');
    const pacote = page.locator('[data-testid^="custos-pacote-"]').first();
    await pacote.getByLabel('Equipe: valor fixo por festa').fill('800,00');
    await pacote.getByRole('button', { name: /Salvar custos/ }).click();
    await expect(page.getByText('Custos previstos do pacote salvos.')).toBeVisible();

    // cancelar: acesso até o fim do período pago
    await page.goto('/app/solucoes/orkmargem');
    await page.getByTestId('cancelar-solucao').click();
    await page.getByTestId('confirmar-cancelamento').click();
    await expect(page.getByTestId('situacao-solucao')).toHaveText('Cancelamento agendado');
  } finally {
    await noBanco(
      (sql) => sql`update public.modulos set venda_liberada = false where codigo = 'orkmargem'`,
    );
  }
});

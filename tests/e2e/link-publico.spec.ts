import { expect, test, type Browser, type Page } from '@playwright/test';
import { noBanco, zerarLimites } from './banco';
import { cadastrar, emailUnico, semRolagemHorizontal } from './helpers';

/*
 * Link público (Etapa 4), no celular. Cada teste cria uma empresa nova com o modelo de exemplo
 * (Salão principal; turnos Almoço, Tarde e Noite), para não disputar datas com os outros.
 * O cliente final navega num contexto sem login (logado, o link abre em modo teste).
 */

test.beforeAll(async () => {
  await zerarLimites();
});

async function empresaComModelo(page: Page, buffet: string): Promise<string> {
  await cadastrar(page, {
    nome: 'Dona Link',
    email: emailUnico('link'),
    whatsapp: '34991355450',
    senha: 'senha-forte-123',
    buffet,
    segmento: 'Buffet infantil',
  });
  await expect(page).toHaveURL(/\/app\/leads$/);
  await page.goto('/app/empresa/catalogo');
  await page.getByRole('button', { name: 'Carregar modelo de exemplo' }).click();
  await expect(page.getByTestId('card-pacote').first()).toBeVisible();
  await page.goto('/app/empresa/link');
  const link = await page.getByTestId('link-principal').innerText();
  return link.split('/b/')[1]!;
}

async function visitante(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  return ctx.newPage();
}

/** Passos 1 e 2: festa, a n-ésima data livre do próximo mês, primeiro turno livre, 40 adultos. */
async function festaEData(page: Page, opcoes: { data?: string; pularTipo?: boolean } = {}) {
  if (!opcoes.pularTipo) {
    await expect(page.getByTestId('passo-atual')).toHaveText(/Passo 1 de 6/);
    await page.getByRole('radio', { name: 'Aniversário infantil' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
  }
  await expect(page.getByTestId('passo-atual')).toHaveText(/Passo 2 de 6/);
  await page.getByRole('button', { name: 'Próximo mês' }).click();
  const dia = opcoes.data
    ? page.getByTestId(`data-${opcoes.data}`)
    : page.locator('[data-testid^="data-"]:not([disabled])').nth(8);
  await expect(dia).toBeEnabled();
  const data = (await dia.getAttribute('data-testid'))!.replace('data-', '');
  await dia.click();
  await page.locator('[data-testid="turno"]:not([disabled])').first().click();
  await page.getByRole('spinbutton', { name: 'Adultos' }).fill('40');
  await expect(page.getByTestId('motivo')).toHaveText('');
  await page.getByRole('button', { name: 'Continuar' }).click();
  return data;
}

async function contato(page: Page, nome: string, whatsapp: string) {
  await expect(page.getByTestId('passo-atual')).toHaveText(/Passo 3 de 6/);
  await page.getByLabel('Seu nome').fill(nome);
  await page.getByLabel('Seu WhatsApp').fill(whatsapp);
  await page.getByRole('checkbox').check();
  // tempo mínimo de preenchimento (anti-robô)
  await page.waitForTimeout(2_600);
  await page.getByRole('button', { name: 'Ver pacotes e valores' }).click();
  await expect(page.getByTestId('passo-atual')).toHaveText(/Passo 4 de 6/);
}

async function pacoteEProposta(page: Page) {
  await page.getByTestId('opcao-pacote').first().click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByTestId('passo-atual')).toHaveText(/Passo 5 de 6/);
  await page.getByRole('button', { name: 'Ver minha proposta' }).click();
  await expect(page).toHaveURL(/\/proposta\/[A-Za-z0-9_-]{32,}$/);
  await expect(page.getByTestId('total-proposta')).toContainText('R$');
}

test.describe('link público', () => {
  test('cliente monta o orçamento e pré-reserva; o dono vê o lead e a agenda', async ({
    page,
    browser,
  }) => {
    const slug = await empresaComModelo(page, 'Buffet Link Um');
    const cliente = await visitante(browser);
    await cliente.goto(`/b/${slug}?origem=instagram`);
    await expect(cliente.getByRole('heading', { name: 'Buffet Link Um', level: 1 })).toBeVisible();
    expect(await semRolagemHorizontal(cliente)).toBe(true);
    await cliente.getByRole('link', { name: 'Montar meu orçamento' }).click();

    const data = await festaEData(cliente);
    await expect(cliente.getByTestId('preco-resumo')).toContainText('A partir de R$');
    await contato(cliente, 'Fernanda Cliente', '34992223344');
    await pacoteEProposta(cliente);
    expect(await semRolagemHorizontal(cliente)).toBe(true);

    await cliente.getByRole('button', { name: 'Quero reservar esta data' }).click();
    await expect(cliente.getByTestId('pre-reserva-ok')).toContainText('Data pré-reservada!');

    // Dono: o lead aparece pré-reservado, com a linha do tempo.
    await page.goto('/app/leads');
    const card = page.getByTestId('card-lead').filter({ hasText: 'Fernanda Cliente' });
    await expect(card).toContainText('Pré-reservado');
    await card.getByRole('link', { name: 'Fernanda Cliente' }).click();
    await expect(page).toHaveURL(/\/app\/leads\/[0-9a-f-]{36}$/);
    const tempo = page.getByTestId('linha-do-tempo');
    await expect(tempo).toContainText('Pediu pré-reserva');
    await expect(tempo).toContainText('Pediu orçamento pelo link');
    await expect(page.getByTestId('detalhe-lead')).toContainText('Veio de Instagram');

    // Agenda: a pré-reserva veio do link.
    await page.goto(`/app/agenda?mes=${data.slice(0, 7)}`);
    const dia = page.getByTestId(`lista-dia-${data}`);
    await expect(dia).toContainText('Fernanda Cliente');
    await expect(dia.getByTestId('selo-link')).toBeVisible();
  });

  test('segundo cliente no mesmo horário recebe sugestões de outras datas', async ({
    page,
    browser,
  }) => {
    const slug = await empresaComModelo(page, 'Buffet Link Dois');
    const a = await visitante(browser);
    const b = await visitante(browser);
    await a.goto(`/b/${slug}/orcamento`);
    await b.goto(`/b/${slug}/orcamento`);
    const data = await festaEData(a);
    await festaEData(b, { data });
    await contato(a, 'Cliente A', '34992220001');
    await contato(b, 'Cliente B', '34992220002');
    await pacoteEProposta(a);
    await pacoteEProposta(b);

    await a.getByRole('button', { name: 'Quero reservar esta data' }).click();
    await expect(a.getByTestId('pre-reserva-ok')).toBeVisible();

    await b.getByRole('button', { name: 'Quero reservar esta data' }).click();
    const sugestoes = b.getByTestId('sugestoes');
    await expect(sugestoes).toContainText('Essa data acabou de ser reservada por outra pessoa');
    await expect(b.getByTestId('sugestao').first()).toBeVisible();
    const urlAntes = b.url();
    await b.getByTestId('sugestao').first().click();
    await expect(b).not.toHaveURL(urlAntes);
    await expect(b.getByTestId('titulo-proposta')).toContainText('Proposta nº');
    await b.getByRole('button', { name: 'Quero reservar esta data' }).click();
    await expect(b.getByTestId('pre-reserva-ok')).toBeVisible();
  });

  test('?tipo= pula o primeiro passo e recarregar no passo 4 retoma de onde parou', async ({
    page,
    browser,
  }) => {
    const slug = await empresaComModelo(page, 'Buffet Link Três');
    const cliente = await visitante(browser);
    await cliente.goto(`/b/${slug}`);
    const chip = cliente.getByRole('link', { name: 'Aniversário infantil' });
    await chip.click();
    await expect(cliente).toHaveURL(/tipo=/);
    await festaEData(cliente, { pularTipo: true });
    await contato(cliente, 'Gabriel Cliente', '34992225566');

    await cliente.reload();
    await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 4 de 6/);
    await expect(cliente.getByTestId('opcao-pacote').first()).toBeVisible();
    await cliente.getByTestId('opcao-pacote').first().click();
    await expect(cliente.getByTestId('preco-resumo')).toContainText('Total R$');

    // Voltar no navegador funciona (passo 3) e avançar de novo continua no orçamento.
    await cliente.goBack();
    await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 3 de 6/);
  });

  test('buffet com pendências e buffet suspenso não mostram o wizard', async ({
    page,
    browser,
  }) => {
    await cadastrar(page, {
      nome: 'Dona Pendente',
      email: emailUnico('pendente'),
      whatsapp: '34991355450',
      senha: 'senha-forte-123',
      buffet: 'Buffet Link Pendente',
      segmento: 'Buffet infantil',
    });
    await expect(page).toHaveURL(/\/app\/leads$/);
    await page.goto('/app/empresa/link');
    const slug = (await page.getByTestId('link-principal').innerText()).split('/b/')[1]!;
    const cliente = await visitante(browser);

    await cliente.goto(`/b/${slug}`);
    await expect(
      cliente.getByRole('heading', { name: 'Este buffet está finalizando o orçamento online' }),
    ).toBeVisible();
    await expect(cliente.getByRole('link', { name: 'Montar meu orçamento' })).toHaveCount(0);
    await cliente.goto(`/b/${slug}/orcamento`);
    await expect(cliente).toHaveURL(new RegExp(`/b/${slug}$`));

    await noBanco((sql) => sql`update public.empresas set plano = 'suspenso' where slug = ${slug}`);
    await cliente.goto(`/b/${slug}`);
    await expect(
      cliente.getByRole('heading', { name: 'O orçamento online está indisponível no momento' }),
    ).toBeVisible();
    await expect(cliente.getByRole('link', { name: 'Falar no WhatsApp' })).toBeVisible();
  });

  test('modo teste: o dono testa o próprio link e nada vai para a agenda', async ({ page }) => {
    const slug = await empresaComModelo(page, 'Buffet Link Teste');
    await page.getByTestId('testar-como-cliente').waitFor();
    await page.goto(`/b/${slug}`);
    await expect(page.getByText('Modo teste: nada aqui conta nas métricas')).toBeVisible();
    await page.getByRole('link', { name: 'Montar meu orçamento' }).click();
    const data = await festaEData(page);
    await contato(page, 'Dona Testando', '34991355450');
    await pacoteEProposta(page);
    await page.getByRole('button', { name: 'Quero reservar esta data' }).click();
    await expect(page.getByTestId('pre-reserva-ok')).toContainText('Pré-reserva simulada');

    await page.goto(`/app/agenda?mes=${data.slice(0, 7)}`);
    await expect(page.getByTestId(`lista-dia-${data}`)).toHaveCount(0);
    await page.goto('/app/leads');
    await expect(page.getByText('Dona Testando')).toHaveCount(0);
    await page.goto('/app/leads?teste=1');
    const card = page.getByTestId('card-lead').filter({ hasText: 'Dona Testando' });
    await expect(card).toContainText('Teste');
  });
});

test.describe('leads no desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('dono vê a lista e a linha do tempo do lead do seed', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill('dono@demo.local');
    await page.getByLabel('Senha', { exact: true }).fill('demo12345');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/app\/leads$/);
    await page.getByTestId('hoje-pre_reservas').click();
    await expect(page).toHaveURL(/ver=pre_reservas/);
    const card = page.getByTestId('card-lead').filter({ hasText: 'Patrícia Lima' });
    await expect(card).toContainText('R$ 5.600,00');
    await card.getByRole('link', { name: 'Patrícia Lima' }).click();
    await expect(page.getByTestId('linha-do-tempo')).toContainText('Pediu pré-reserva');
    await expect(page.getByTestId('detalhe-lead')).toContainText('Pacote Super');
    expect(await semRolagemHorizontal(page)).toBe(true);
  });
});

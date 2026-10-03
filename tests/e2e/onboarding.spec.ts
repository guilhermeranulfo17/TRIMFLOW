import { expect, test, type Browser, type Page } from '@playwright/test';
import { noBanco, zerarLimites } from './banco';
import { cadastrar, emailUnico, entrar, semRolagemHorizontal, SENHA_SEED } from './helpers';

/*
 * Etapa 8: onboarding guiado, checklist, Link e divulgação (QR) e Números, no celular (375x812).
 * Cada teste de onboarding cria a própria conta; checklist e Números usam o Buffet Demo do seed
 * (o estado mexido é restaurado no início do teste).
 */

test.beforeEach(async () => {
  await zerarLimites();
});

/** Domingos (sem ajuste de dia no modelo infantil) do mês seguinte ao próximo, em yyyy-MM-dd. */
function domingosDaqui(meses: number): string[] {
  const hoje = new Date();
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth() + meses;
  const datas: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(ano, mes, d));
    if (dt.getUTCMonth() !== ((mes % 12) + 12) % 12) break;
    if (dt.getUTCDay() === 0) datas.push(dt.toISOString().slice(0, 10));
  }
  return datas;
}

async function novaConta(page: Page, buffet: string) {
  await cadastrar(page, {
    nome: 'Dona Onboarding',
    email: emailUnico('onboarding'),
    whatsapp: '34991355450',
    senha: 'senha-forte-123',
    buffet,
    segmento: 'Buffet infantil',
  });
  await expect(page).toHaveURL(/\/app\/comecar$/);
  await expect(page.getByTestId('passo-onboarding')).toHaveText('Passo 1 de 5');
}

const continuar = (page: Page) => page.getByTestId('continuar-onboarding').click();
const noPasso = (page: Page, n: number) =>
  expect(page.getByTestId('passo-onboarding')).toHaveText(`Passo ${n} de 5`);

async function visitante(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  return ctx.newPage();
}

test('cadastro → onboarding digitando só os preços → link no ar com os preços digitados', async ({
  page,
  browser,
}) => {
  const inicio = Date.now();
  const buffet = `Buffet Onboarding ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await novaConta(page, buffet);

  // 1. modelo pronto
  await expect(page.getByTestId('resumo-modelo')).toContainText('Alegria');
  expect(await semRolagemHorizontal(page)).toBe(true);
  await continuar(page);

  // 2. identidade (pula)
  await noPasso(page, 2);
  await page.getByRole('button', { name: 'Pular por agora' }).click();

  // 3. preços: só um valor por pacote
  await noPasso(page, 3);
  await page.getByLabel('Preço do Alegria até 30 convidados').fill('3.333,00');
  await page.getByLabel('Preço do Super até 30 convidados').fill('3.900,00');
  await page.getByLabel('Preço do Encanto até 30 convidados').fill('4.800,00');
  // as outras faixas saem na proporção do modelo e aparecem para conferir
  await expect(page.getByTestId('preco-pacote').first()).toContainText('até 50:');
  expect(await semRolagemHorizontal(page)).toBe(true);
  await page.getByRole('button', { name: 'Confirmar preços e continuar' }).click();

  // 4. agenda
  await noPasso(page, 4);
  await continuar(page);

  // 5. pronto
  await noPasso(page, 5);
  const link = await page.getByTestId('link-pronto').innerText();
  expect(link).toMatch(/\/b\/buffet-onboarding-/);
  const segundos = Math.round((Date.now() - inicio) / 1000);
  const [tempo] = await noBanco(
    (sql) => sql<{ s: number }[]>`
      select extract(epoch from onboarding_concluido_em - onboarding_iniciado_em)::int as s
      from public.empresas where nome = ${buffet}`,
  );
  console.info(`[onboarding] cadastro até o passo 5: ${segundos}s (banco: ${tempo!.s}s)`);
  expect(segundos).toBeLessThan(600);

  // "Testar como cliente" abre o link em modo teste
  const [aba] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByTestId('testar-como-cliente').click(),
  ]);
  await expect(aba.getByRole('heading', { name: buffet, level: 1 })).toBeVisible();
  await expect(aba.getByText('A partir de R$ 3.333,00').first()).toBeVisible();
  await aba.close();

  // o cliente (sem login) monta um orçamento num domingo (sem ajuste de dia) com 20 adultos:
  // o total é exatamente o preço digitado do Alegria
  const slug = link.split('/b/')[1]!;
  const cliente = await visitante(browser);
  await cliente.goto(`/b/${slug}/orcamento`);
  await cliente.getByRole('radio', { name: 'Aniversário infantil' }).click();
  await cliente.getByRole('button', { name: 'Continuar' }).click();
  await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 2 de 6/);
  await cliente.getByRole('button', { name: 'Próximo mês' }).click();
  await cliente.getByRole('button', { name: 'Próximo mês' }).click();
  const domingo = domingosDaqui(2).find(() => true)!;
  await cliente.getByTestId(`data-${domingo}`).click();
  await cliente.locator('[data-testid="turno"]:not([disabled])').first().click();
  await cliente.getByRole('spinbutton', { name: 'Adultos' }).fill('20');
  await expect(cliente.getByTestId('preco-resumo')).toContainText('R$');
  await cliente.getByRole('button', { name: 'Continuar' }).click();
  await cliente.getByLabel('Seu nome').fill('Cliente do Teste');
  await cliente.getByLabel('Seu WhatsApp').fill('34992223399');
  await cliente.getByRole('checkbox').check();
  await cliente.waitForTimeout(2_600); // anti-robô
  await cliente.getByRole('button', { name: 'Ver pacotes e valores' }).click();
  await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 4 de 6/);
  await cliente.getByTestId('opcao-pacote').filter({ hasText: 'Alegria' }).click();
  await cliente.getByRole('button', { name: 'Continuar' }).click();
  await cliente.getByRole('button', { name: 'Ver minha proposta' }).click();
  await expect(cliente.getByTestId('total-proposta')).toContainText('R$ 3.333,00');
  await cliente.context().close();
});

test('fechar no passo 3, voltar e continuar do mesmo ponto; a faixa some ao concluir', async ({
  page,
}) => {
  await novaConta(page, 'Buffet Volta Depois');
  await continuar(page);
  await noPasso(page, 2);
  await page.getByRole('button', { name: 'Pular por agora' }).click();
  await noPasso(page, 3);

  // sai sem confirmar preço
  await page.getByRole('link', { name: 'Sair e terminar depois' }).click();
  await expect(page).toHaveURL(/\/app\/leads$/);
  const faixa = page.getByTestId('faixa-onboarding');
  await expect(faixa).toContainText('Termine de configurar seu link (passo 3 de 5)');

  // volta pela faixa direto no passo 3
  await faixa.click();
  await noPasso(page, 3);
  // sem preço não avança (o botão fica desligado)
  await expect(page.getByRole('button', { name: 'Confirmar preços e continuar' })).toBeDisabled();
  await page.getByLabel('Preço do Super até 30 convidados').fill('3.500,00');
  await page.getByRole('button', { name: 'Confirmar preços e continuar' }).click();
  await noPasso(page, 4);
  await continuar(page);
  await noPasso(page, 5);
  await page.getByTestId('ir-para-caixa').click();
  await expect(page).toHaveURL(/\/app\/leads$/);
  await expect(page.getByTestId('faixa-onboarding')).toHaveCount(0);
});

test.describe('Buffet Demo', () => {
  test.describe.configure({ mode: 'serial' });

  test('checklist: "Fiz" na bio sobe o percentual; dispensar e reativar em Minha conta', async ({
    page,
  }) => {
    await noBanco(async (sql) => {
      await sql`update public.empresas set link_na_bio_em = null where slug = 'buffet-demo'`;
      await sql`update public.usuarios set checklist_dispensado_em = null where email = 'dono@demo.local'`;
    });
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    const checklist = page.getByTestId('checklist');
    await expect(checklist).toBeVisible();
    const antes = Number(await checklist.getAttribute('data-percentual'));
    await page.getByRole('button', { name: /Seu link está \d+% pronto/ }).click();
    await expect(page.getByTestId('item-linkNaBio')).toHaveAttribute('data-feito', 'false');
    // clique antes da hidratação se perde: repete enquanto o "Fiz" ainda estiver na tela
    const fiz = page.getByTestId('item-linkNaBio').getByTestId('fiz-link-na-bio');
    await expect(async () => {
      if (await fiz.isVisible()) await fiz.click();
      await expect(checklist).not.toHaveAttribute('data-percentual', String(antes), {
        timeout: 3_000,
      });
    }).toPass({ timeout: 25_000 });
    const depois = Number(await checklist.getAttribute('data-percentual'));
    expect(depois).toBeGreaterThan(antes);
    expect(await semRolagemHorizontal(page)).toBe(true);

    // dispensar: some da caixa; reativar em Minha conta
    await page.getByRole('button', { name: 'Dispensar checklist' }).click();
    await expect(page.getByTestId('checklist')).toHaveCount(0);
    await page.goto('/app/conta/avisos');
    await page.getByTestId('reativar-checklist').click();
    await expect(page.getByTestId('reativar-checklist')).toHaveText('Esconder o checklist');
    await page.goto('/app/leads');
    await expect(page.getByTestId('checklist')).toBeVisible();

    // restaura o seed
    await noBanco(
      (sql) => sql`update public.empresas set link_na_bio_em = null where slug = 'buffet-demo'`,
    );
  });

  test('Link e divulgação: links por origem, textos prontos e QR em PNG e PDF', async ({
    page,
  }) => {
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    await page.goto('/app/empresa/link');
    await expect(page.getByTestId('links-por-origem')).toContainText('origem=qrcode');
    await expect(page.getByTestId('texto-resposta')).toContainText(
      'Oi! Monte seu orçamento em 2 minutos e veja as datas livres:',
    );
    await expect(
      page.getByTestId('qr-codigo').getByRole('img', { name: /QR code que abre/ }),
    ).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);

    const png = await page.request.get('/app/empresa/link/qr?formato=png');
    expect(png.status()).toBe(200);
    expect(png.headers()['content-type']).toBe('image/png');
    expect((await png.body()).subarray(1, 4).toString()).toBe('PNG');

    const pdf = await page.request.get('/app/empresa/link/qr?formato=pdf');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('Números: trocar o período muda os cartões; copiar o texto de promoção', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    await page.goto('/app/numeros?periodo=90d');
    await expect(page.getByTestId('pagina-numeros')).toBeVisible();
    const valor = page.getByTestId('cartao-valor-valor');
    const em90 = await valor.innerText();
    expect(em90).toMatch(/^R\$ /);
    await expect(page.getByTestId('funil')).toContainText('Visitas ao link');
    await expect(page.getByTestId('por-origem')).toContainText('QR code');
    await expect(page.getByTestId('motivos-perda')).toContainText('Preço');
    expect(await semRolagemHorizontal(page)).toBe(true);

    await page.getByTestId('periodo-7d').click();
    await expect(page).toHaveURL(/periodo=7d/);
    await expect(page.getByTestId('periodo-7d')).toHaveAttribute('aria-current', 'page');
    await expect(valor).not.toHaveText(em90);

    const primeira = page.getByTestId('data-livre').first();
    await primeira.getByRole('button', { name: /Copiar texto de promoção/ }).click();
    await expect(primeira.getByRole('button', { name: /Copiar texto de promoção/ })).toHaveText(
      'Copiado',
    );
    const texto = await page.evaluate(() => navigator.clipboard.readText());
    expect(texto).toMatch(/^Ainda temos o (sábado|domingo) \d{2}\/\d{2} .+ livre no Buffet Demo!/);
  });
});

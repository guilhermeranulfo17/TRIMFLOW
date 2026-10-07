import { expect, test, type Browser, type Page } from '@playwright/test';
import { noBanco, zerarLimites } from './banco';
import { cadastrar, emailUnico, SENHA_SEED, semRolagemHorizontal, irAoPasso2 } from './helpers';

/*
 * Etapa 9B · B.8 "Jornada do buffet", ponta a ponta no celular (375x812), contra o app real e a
 * API falsa do Asaas. Roda em todo PR:
 *   landing (Testar grátis com origem do anúncio) → cadastro → onboarding → testar como cliente →
 *   cliente de verdade monta o orçamento e pede pré-reserva → aviso no sino → vendedor confirma o
 *   sinal → reserva na Agenda → Números mostra → teste acaba (somente leitura) → assina (sandbox
 *   simulado) → continua usando.
 */

test.beforeEach(async () => {
  await zerarLimites();
});

async function celular(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  return ctx.newPage();
}

async function toast(page: Page, texto: string | RegExp) {
  await expect(page.getByTestId('toast').filter({ hasText: texto })).toBeVisible();
}

async function contadorDoSino(page: Page): Promise<number> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const selo = page.getByTestId('contador-avisos');
  if (!(await selo.isVisible())) return 0;
  const t = (await selo.innerText()).trim();
  return t === '99+' ? 100 : Number(t);
}

test('jornada do buffet: da landing à assinatura, sem sair do celular', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase();
  const buffet = `Buffet Jornada ${sufixo}`;
  const email = emailUnico('jornada');

  // 1. Landing → "Testar grátis" (anúncio do Instagram) → cadastro
  await page.goto('/?utm_source=instagram&utm_campaign=jornada');
  await page
    .getByRole('main')
    .getByRole('link', { name: /Testar 14 dias grátis/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/cadastro$/);
  await cadastrar(page, {
    nome: 'Dona Jornada',
    email,
    whatsapp: '34991355450',
    senha: SENHA_SEED,
    buffet,
    segmento: 'Buffet infantil',
  });
  await expect(page).toHaveURL(/\/app\/comecar$/);
  const empresaId = await noBanco(async (sql) => {
    const [e] = await sql<{ id: string; o: Record<string, string> | null; plano: string }[]>`
      select e.id, e.origem_cadastro as o, e.plano::text as plano from public.empresas e
      join public.usuarios u on u.empresa_id = e.id where u.email = ${email}`;
    expect(e!.o).toMatchObject({ utm_source: 'instagram', utm_campaign: 'jornada' });
    expect(e!.plano).toBe('trial');
    return e!.id;
  });

  // 2. Onboarding: modelo pronto, preços digitados, agenda, pronto
  await expect(page.getByTestId('resumo-modelo')).toContainText('Alegria');
  await page.getByTestId('continuar-onboarding').click();
  await page.getByRole('button', { name: 'Pular por agora' }).click();
  await expect(page.getByTestId('passo-onboarding')).toHaveText('Passo 3 de 5');
  await page.getByLabel('Preço do Alegria até 30 convidados').fill('3.200,00');
  await page.getByLabel('Preço do Super até 30 convidados').fill('3.900,00');
  await page.getByLabel('Preço do Encanto até 30 convidados').fill('4.800,00');
  await page.getByRole('button', { name: 'Confirmar preços e continuar' }).click();
  await expect(page.getByTestId('passo-onboarding')).toHaveText('Passo 4 de 5');
  await page.getByTestId('continuar-onboarding').click();
  await expect(page.getByTestId('passo-onboarding')).toHaveText('Passo 5 de 5');
  const link = await page.getByTestId('link-pronto').innerText();
  const slug = link.split('/b/')[1]!.trim();
  expect(await semRolagemHorizontal(page)).toBe(true);

  // 3. Testar como cliente (modo teste: nada vira lead real)
  const [aba] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByTestId('testar-como-cliente').click(),
  ]);
  await expect(aba.getByRole('heading', { name: buffet, level: 1 })).toBeVisible();
  await expect(aba.getByText('A partir de R$ 3.200,00').first()).toBeVisible();
  await aba.close();

  // 4. Um cliente de verdade (outro celular) monta o orçamento e pede a pré-reserva
  await page.goto('/app/leads');
  // o sino do esqueleto e o de verdade coexistem por um instante (streaming): espera ficar um só
  await expect(page.getByTestId('sino')).toHaveCount(1);
  const antes = await contadorDoSino(page);
  const cliente = await celular(browser);
  const nomeCliente = `Camila Jornada ${sufixo}`;
  await cliente.goto(`/b/${slug}/orcamento`);
  await irAoPasso2(cliente);
  await cliente.getByRole('button', { name: 'Próximo mês' }).click();
  const dia = cliente.locator('[data-testid^="data-"]:not([disabled])').first();
  const data = (await dia.getAttribute('data-testid'))!.replace('data-', '');
  await dia.click();
  await cliente.locator('[data-testid="turno"]:not([disabled])').first().click();
  await cliente.getByRole('spinbutton', { name: 'Adultos' }).fill('40');
  await expect(cliente.getByTestId('preco-resumo')).toContainText('R$');
  await expect(async () => {
    await cliente.getByRole('button', { name: 'Continuar' }).click();
    await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 3 de 6/, { timeout: 2_000 });
  }).toPass();
  await cliente.getByLabel('Seu nome').fill(nomeCliente);
  await cliente.getByLabel('Seu WhatsApp').fill(`349${String(Date.now()).slice(-8)}`);
  await cliente.getByRole('checkbox').check();
  await cliente.waitForTimeout(2_600); // anti-robô
  await cliente.getByRole('button', { name: 'Ver pacotes e valores' }).click();
  await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 4 de 6/);
  await cliente.getByTestId('opcao-pacote').filter({ hasText: 'Alegria' }).click();
  // o toque pode chegar enquanto o preço do pacote escolhido ainda está sendo calculado
  await expect(async () => {
    await cliente.getByRole('button', { name: 'Continuar' }).click();
    await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 5 de 6/, { timeout: 2_000 });
  }).toPass();
  await cliente.getByRole('button', { name: 'Ver minha proposta' }).click();
  await expect(cliente).toHaveURL(/\/proposta\/[A-Za-z0-9_-]{32,}$/);
  await cliente.getByRole('button', { name: 'Quero reservar esta data' }).click();
  await expect(cliente.getByTestId('pre-reserva-ok')).toContainText('Data pré-reservada!');
  await cliente.context().close();

  // 5. O aviso chega no sino do dono e abre o lead
  await expect(async () => {
    expect(await contadorDoSino(page)).toBeGreaterThan(antes);
  }).toPass({ timeout: 30_000 });
  await page.getByTestId('sino').click();
  const aviso = page.getByTestId('item-aviso').filter({ hasText: nomeCliente });
  await expect(aviso).toContainText('Pré-reserva');
  await aviso.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(nomeCliente);

  // 6. O dono cria o vendedor; o vendedor (no celular dele) confirma o sinal na Agenda
  await page.goto('/app/empresa/usuarios');
  await page.getByRole('button', { name: 'Novo vendedor' }).click();
  const dialogo = page.getByRole('dialog');
  const emailVendedor = emailUnico('jornada-vendedor');
  await dialogo.getByLabel('Nome').fill('Vítor Vendas');
  await dialogo.getByLabel('E-mail').fill(emailVendedor);
  await dialogo.getByLabel('WhatsApp').fill('34991355451');
  await dialogo.getByRole('button', { name: 'Criar vendedor' }).click();
  const senhaTemporaria = (await page.getByTestId('senha-temporaria').textContent())!.trim();
  await dialogo.getByRole('button', { name: 'Concluir' }).click();

  const vendedor = await celular(browser);
  await vendedor.goto('/login');
  await vendedor.getByLabel('E-mail').fill(emailVendedor);
  await vendedor.getByLabel('Senha', { exact: true }).fill(senhaTemporaria);
  await vendedor.getByRole('button', { name: 'Entrar' }).click();
  await expect(vendedor).toHaveURL(/\/nova-senha$/);
  await vendedor.getByLabel('Nova senha', { exact: true }).fill('senha-do-vitor-1');
  await vendedor.getByLabel('Confirme a nova senha').fill('senha-do-vitor-1');
  await vendedor.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(vendedor).toHaveURL(/\/app\/leads$/);

  await vendedor.goto(`/app/agenda?mes=${data.slice(0, 7)}`);
  const linhaDia = vendedor.getByTestId(`lista-dia-${data}`);
  await expect(linhaDia).toContainText('Pré-reservado');
  await linhaDia.click();
  const item = vendedor.getByRole('dialog').getByTestId('item-reserva');
  await item.getByRole('button', { name: 'Confirmar (sinal pago)' }).click();
  await item.getByRole('textbox').first().fill('1.000,00');
  await item.getByRole('button', { name: 'Confirmar reserva' }).click();
  await toast(vendedor, 'Reserva confirmada.');
  await expect(item).toContainText('Reservado');
  await vendedor.keyboard.press('Escape');

  // 7. Reserva na Agenda do dono e nos Números
  await page.goto(`/app/agenda?mes=${data.slice(0, 7)}`);
  await expect(page.getByTestId(`lista-dia-${data}`)).toContainText('Reservado');
  await page.goto('/app/numeros?periodo=30d');
  await expect(page.getByTestId('cartao-reservas-valor')).toHaveText('1');
  await expect(page.getByTestId('cartao-valor-valor')).toContainText('R$');
  await expect(page.getByTestId('cartao-valor-valor')).not.toHaveText('R$ 0,00');
  expect(await semRolagemHorizontal(page)).toBe(true);

  // 8. O teste grátis acaba (relógio simulado no banco): painel somente leitura
  await noBanco(async (sql) => {
    await sql`update public.empresas set trial_ate = now() - interval '1 minute' where id = ${empresaId}`;
    await sql`select public.atualizar_situacoes()`;
  });
  await page.goto('/app/empresa/link');
  const faixa = page.getByTestId('faixa-conta');
  await expect(faixa).toHaveAttribute('data-tipo', 'suspenso');
  await page.getByRole('button', { name: 'Já coloquei o link na bio' }).click();
  await expect(page.getByTestId('toast')).toContainText('somente leitura');

  // 9. Assina (Asaas sandbox simulado): paga por Pix e o webhook ativa a conta
  await faixa.click();
  await expect(page).toHaveURL(/\/app\/empresa\/plano$/);
  await page.getByTestId('plano-profissional').click();
  await page.getByLabel('Nome ou razão social').fill('Dona Jornada');
  await page.getByLabel('CPF ou CNPJ').fill('52998224725');
  await page.getByTestId('botao-assinar').click();
  await expect(page).toHaveURL(/localhost:4010\/fatura\//);
  await page.getByTestId('pagar-pix').click();
  await expect(page).toHaveURL(/\/app\/empresa\/plano\?pagamento=ok$/);
  await expect(page.getByTestId('situacao-plano')).toContainText('Assinatura ativa');
  await expect(page.getByTestId('faixa-conta')).toHaveCount(0);

  // 10. Continua usando: escrever volta a funcionar e o vendedor segue trabalhando
  await page.goto('/app/empresa/link');
  // logo depois do pagamento o painel inteiro é recalculado (revalidate do layout): mais folga
  await page.getByRole('button', { name: 'Já coloquei o link na bio' }).click();
  await expect(page.getByRole('button', { name: 'Link na bio: feito' })).toBeVisible({
    timeout: 30_000,
  });
  await vendedor.goto('/app/leads');
  await expect(vendedor.getByTestId('faixa-conta')).toHaveCount(0);
  await vendedor.context().close();
});

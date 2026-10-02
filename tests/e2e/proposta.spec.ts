import { expect, test, type Browser, type Page } from '@playwright/test';
import { noBanco, zerarLimites } from './banco';
import { entrar, semRolagemHorizontal, SENHA_SEED } from './helpers';

/*
 * Etapa 5: orçamento interno, proposta (web e PDF), versões, rastreio de aberturas e validade.
 * Tudo no Buffet Demo do seed. Cada teste usa um mês diferente da agenda e um WhatsApp novo
 * (os testes rodam em paralelo e o banco não é zerado entre eles).
 */

const SLUG = 'buffet-demo';

function whatsappNovo(): string {
  const n = String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-8);
  return `349${n}`;
}

/** Nome único por execução (o banco local não é zerado entre execuções). */
const unico = (nome: string) => `${nome} ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

async function visitante(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  return ctx.newPage();
}

/** Monta um orçamento interno até o botão de salvar (sem salvar). */
async function montarOrcamento(
  page: Page,
  o: { whatsapp: string; nome: string; mesesAFrente: number; adultos?: number },
) {
  await page.goto('/app/orcamentos/novo');
  await page.getByLabel('WhatsApp do cliente').fill(o.whatsapp);
  await page.getByLabel('Nome do cliente').fill(o.nome);
  await page.getByRole('radio', { name: 'Aniversário infantil' }).click();
  for (let i = 0; i < o.mesesAFrente; i++) {
    await page.getByRole('button', { name: 'Próximo mês' }).click();
  }
  const sabado = page.locator('[aria-label^="sábado"][aria-label$="com horário livre"]').first();
  await sabado.click();
  await page.getByTestId('turno').filter({ hasText: 'começa às' }).first().click();
  await page.locator('#adultos').fill(String(o.adultos ?? 40));
  await page.getByTestId('opcao-pacote').first().click();
  await expect(page.getByTestId('total-interno')).toContainText('R$');
}

async function salvar(page: Page, rotulo = 'Salvar orçamento') {
  await page.getByRole('button', { name: rotulo }).click();
  await expect(page.getByTestId('saidas-orcamento')).toBeVisible();
  return (await page.getByTestId('link-proposta').getAttribute('href'))!.replace(
    /^https?:\/\/[^/]+/,
    '',
  );
}

test.beforeEach(async () => {
  await zerarLimites();
});

test('dono cria orçamento interno com desconto e avulso, envia e o cliente vê o mesmo total', async ({
  page,
  browser,
}) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  const whatsapp = whatsappNovo();
  await montarOrcamento(page, { whatsapp, nome: unico('Lívia Interno'), mesesAFrente: 4 });
  await page.getByLabel('Desconto em porcentagem').fill('10');
  await page.getByLabel('Motivo do desconto (só a equipe vê)').fill('MOTIVO-SECRETO-E2E');
  await page.getByRole('button', { name: 'Item avulso' }).click();
  await page.getByLabel('Descrição do item 1').fill('Mesa de doces extra');
  await page.getByLabel('Valor unitário do item 1').fill('350,00');
  await page.getByLabel('Observações internas').fill('NOTA-INTERNA-E2E');
  await page.getByLabel('Observações para o cliente').fill('Decoração tema fundo do mar.');
  await expect(page.getByTestId('total-interno')).not.toHaveText('—');
  await page.waitForTimeout(600); // última prévia do servidor
  const total = (await page.getByTestId('total-interno').textContent())!;
  expect(await semRolagemHorizontal(page)).toBe(true);

  const link = await salvar(page);
  const envio = page.getByRole('link', { name: 'Enviar pelo WhatsApp' });
  const href = (await envio.getAttribute('href'))!;
  expect(href.startsWith(`https://wa.me/55${whatsapp}?text=`)).toBe(true);
  expect(decodeURIComponent(href)).toContain(`/b/${SLUG}/proposta/`);

  // Cliente, sem sessão: mesmo total, observação pública e nada interno.
  const cliente = await visitante(browser);
  await cliente.goto(link);
  await expect(cliente.getByTestId('total-proposta')).toHaveText(total);
  await expect(cliente.getByText('Decoração tema fundo do mar.')).toBeVisible();
  await expect(cliente.getByText('Mesa de doces extra')).toBeVisible();
  const html = await cliente.content();
  expect(html).not.toContain('NOTA-INTERNA-E2E');
  expect(html).not.toContain('MOTIVO-SECRETO-E2E');
  expect(await semRolagemHorizontal(cliente)).toBe(true);
});

test('item avulso em branco não apaga o total e, ao salvar, destaca o campo', async ({ page }) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  await montarOrcamento(page, {
    whatsapp: whatsappNovo(),
    nome: unico('Avulso Vazio'),
    mesesAFrente: 9,
  });
  const total = page.getByTestId('total-interno');
  await expect(total).toContainText('R$');
  await page.getByRole('button', { name: 'Item avulso' }).click();
  await page.waitForTimeout(800); // nova prévia do servidor
  await expect(total).toContainText('R$');
  await expect(page.getByText('Confira os campos do orçamento.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Salvar orçamento' }).click();
  const descricao = page.getByLabel('Descrição do item 1');
  await expect(descricao).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Descreva o item ou remova a linha.')).toBeVisible();
  await expect(descricao).toBeInViewport();

  await descricao.fill('Mesa de doces extra');
  await page.getByLabel('Valor unitário do item 1').fill('200,00');
  await page.waitForTimeout(800);
  await salvar(page);
});

test('cliente baixa o PDF da proposta', async ({ browser }) => {
  const cliente = await visitante(browser);
  // proposta do seed (nº 0009, Igor Teixeira)
  const token = 'seedEtapa5Orc9v1xxxxxxxxxxxxxxxxxxxxxxxxxx';
  await cliente.goto(`/b/${SLUG}/proposta/${token}`);
  const href = await cliente.getByTestId('baixar-pdf').getAttribute('href');
  const r = await cliente.request.get(href!);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('application/pdf');
  expect(r.headers()['content-disposition']).toContain(
    'filename="Proposta 0009 - Buffet Demo - Igor Teixeira.pdf"',
  );
  expect(r.headers()['cache-control']).toContain('no-store');
  const corpo = await r.body();
  expect(corpo.subarray(0, 5).toString()).toBe('%PDF-');
});

test('cliente abre a proposta duas vezes e o lead fica quente', async ({ page, browser }) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  const nome = unico('Otávio Aberturas');
  await montarOrcamento(page, { whatsapp: whatsappNovo(), nome, mesesAFrente: 5 });
  const link = await salvar(page);
  const token = link.split('/').pop()!;

  const cliente = await visitante(browser);
  await cliente.goto(link);
  await expect(cliente.getByTestId('total-proposta')).toBeVisible();
  // A segunda abertura conta se vier depois de 30 min: recua a primeira no tempo.
  await noBanco(
    (sql) => sql`update public.atividades set criado_em = criado_em - interval '2 hours'
      where tipo = 'proposta_aberta'
        and orcamento_id = (select id from public.orcamentos where token = ${token})`,
  );
  await cliente.reload();
  await expect(cliente.getByTestId('total-proposta')).toBeVisible();

  await page.goto(`/app/leads?q=${encodeURIComponent(nome)}`);
  const card = page.getByTestId('card-lead').filter({ hasText: nome });
  await expect(card.getByTestId('motivo')).toContainText('Abriu a proposta 2x');
  await card.getByRole('link', { name: nome }).click();
  const detalhe = page.getByTestId('detalhe-lead');
  await expect(detalhe.getByRole('heading', { level: 1 })).toHaveText(nome);
  await expect(detalhe).toContainText('Quente');
  await expect(page.getByTestId('linha-do-tempo')).toContainText('Abriu a proposta');
  await expect(page.getByTestId('orcamento-lead').first()).toContainText('Visualizado 2×');
});

test('vendedor passa do limite de desconto, cria nova versão e o link antigo leva à versão 2', async ({
  page,
  browser,
}) => {
  await entrar(page, 'vendedor@demo.local', SENHA_SEED);
  const nome = unico('Rita Versões');
  await montarOrcamento(page, { whatsapp: whatsappNovo(), nome, mesesAFrente: 6 });
  await page.getByLabel('Desconto em porcentagem').fill('8');
  await expect(page.getByText('O desconto passa do seu limite de 5%.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar orçamento' })).toBeDisabled();
  await page.getByLabel('Desconto em porcentagem').fill('5');
  await expect(page.getByText('Seu limite de desconto: 5%')).toBeVisible();
  const linkAntigo = await salvar(page);

  await page.getByRole('link', { name: 'Ver no lead' }).click();
  await page.getByRole('link', { name: 'Nova versão' }).click();
  await expect(page.getByTestId('cliente-fixo')).toContainText(nome);
  await expect(page.getByTestId('total-interno')).toContainText('R$');
  await page.locator('#adultos').fill('60');
  await page.waitForTimeout(600);
  await salvar(page, 'Salvar nova versão');
  await expect(page.getByTestId('saidas-orcamento')).toContainText('versão 2');

  const cliente = await visitante(browser);
  await cliente.goto(linkAntigo);
  await expect(cliente).toHaveURL(/atualizada=1/);
  await expect(cliente.getByTestId('aviso-atualizada')).toContainText(
    'Esta proposta foi atualizada em',
  );
  await expect(cliente.getByTestId('titulo-proposta')).toContainText('versão 2');
});

test('proposta vencida mostra o aviso e "Atualizar com os preços de hoje" gera versão nova', async ({
  page,
  browser,
}) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  await montarOrcamento(page, {
    whatsapp: whatsappNovo(),
    nome: unico('Sônia Vencida'),
    mesesAFrente: 7,
  });
  const link = await salvar(page);
  const token = link.split('/').pop()!;
  await noBanco(
    (sql) =>
      sql`update public.orcamentos set validade_ate = current_date - 2 where token = ${token}`,
  );

  const cliente = await visitante(browser);
  await cliente.goto(link);
  await expect(cliente.getByTestId('aviso-expirada')).toContainText('Venceu em');
  await cliente.getByRole('button', { name: 'Atualizar com os preços de hoje' }).click();
  await expect(cliente).not.toHaveURL(new RegExp(token));
  await expect(cliente.getByTestId('titulo-proposta')).toContainText('versão 2');
  await expect(cliente.getByTestId('aviso-expirada')).toHaveCount(0);
});

test.describe('no desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('pré-reserva a partir do orçamento interno e aparece na Agenda', async ({ page }) => {
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    const nome = unico('Tadeu Agenda');
    await montarOrcamento(page, { whatsapp: whatsappNovo(), nome, mesesAFrente: 8 });
    expect(await semRolagemHorizontal(page)).toBe(true);
    await salvar(page);
    await page.getByRole('button', { name: 'Pré-reservar a data' }).click();
    await expect(page.getByText(/Pré-reservado até/)).toBeVisible();

    const pdf = await page.getByTestId('baixar-pdf-interno').getAttribute('href');
    const r = await page.request.get(pdf!);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-disposition']).toContain(`${nome}.pdf`);

    const { data } = await noBanco(async (sql) => {
      const [l] = await sql<{ data: string }[]>`
        select to_char(r.data, 'YYYY-MM-DD') as data from public.reservas r
        join public.leads l on l.id = r.lead_id
        where l.nome = ${nome} and r.status = 'ativa'`;
      return l!;
    });
    await page.goto(`/app/agenda?mes=${data.slice(0, 7)}`);
    const dia = page.getByTestId(`lista-dia-${data}`);
    await expect(dia).toContainText(nome);
    await expect(dia).toContainText('Pré-reservado');
  });
});

import { expect, test, type Page } from '@playwright/test';
import { noBanco } from './banco';
import { cadastrar, emailUnico, entrar, SENHA_SEED, semRolagemHorizontal } from './helpers';

/*
 * Landing em `/` (nov/2026): seis blocos e nada mais. Topo, demonstração (o "Buffet Exemplo" com
 * os passos reais do link público, rodando no navegador), resultado (o pedido como chega para o
 * dono), três benefícios, um preço só (do banco) e o botão final para o cadastro. A página não
 * toca no Auth e a origem do anúncio vai para empresas.origem_cadastro.
 */

const normal = (s: string) => s.replace(/ /g, ' ');
/** Requisições que a demonstração NÃO pode fazer: tudo o que não é leitura nem contagem. */
const ehEnvio = (metodo: string, url: string) =>
  metodo !== 'GET' && !url.includes('/api/landing/contar') && !url.includes('/api/prospeccao/');

async function irParaDemonstracao(page: Page) {
  await page.goto('/');
  await page.getByTestId('ir-para-demonstracao').click();
  await expect(page).toHaveURL(/#demonstracao$/);
  await expect(page.getByTestId('demonstracao')).toBeInViewport();
}

test('é a landing (sem redirecionar), com os seis blocos, e não chama o Auth', async ({ page }) => {
  const auth: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/auth/v1')) auth.push(r.url());
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Seu cliente monta o orçamento sozinho.',
  );
  await expect(
    page.getByRole('link', { name: 'Monte um orçamento como se fosse seu cliente' }),
  ).toHaveAttribute('href', '#demonstracao');
  // topo, demonstração, resultado, benefícios, preço e botão final: nada além disso
  await expect(page.locator('main > section')).toHaveCount(6);
  await expect(page.getByText('É assim que o pedido chega pra você.')).toBeVisible();
  for (const beneficio of [
    'Seu cliente não espera.',
    'Você não gasta tempo com curioso.',
    'Nenhum pedido fica sem retorno.',
  ]) {
    await expect(page.getByText(beneficio, { exact: true })).toBeVisible();
  }
  await page.waitForLoadState('networkidle');
  expect(auth).toEqual([]);
  expect(await semRolagemHorizontal(page)).toBe(true);
});

test('um preço só, vindo do banco: sem outro plano, sem anual e sem valor de implantação', async ({
  page,
}) => {
  const planos = await noBanco(
    (sql) =>
      sql<
        { codigo: string; preco_mensal_centavos: number; preco_anual_centavos: number }[]
      >`select codigo, preco_mensal_centavos, preco_anual_centavos from public.planos where ativo`,
  );
  const reais = (centavos: number) => `R$ ${(centavos / 100).toLocaleString('pt-BR')}`;
  const vendido = planos.find((p) => p.codigo === 'profissional')!;
  await page.goto('/');
  const preco = page.locator('#preco');
  await expect(preco.getByTestId('preco')).toContainText(reais(vendido.preco_mensal_centavos));
  await expect(preco.getByTestId('preco')).toContainText('por mês');
  await expect(preco).toContainText('14 dias grátis, sem cartão');
  await expect(preco).toContainText('Implantação assistida grátis');

  // fora da demonstração (valores fictícios do Buffet Exemplo), a página tem um único valor
  const fora = normal(
    await page.evaluate(() =>
      [...document.querySelectorAll('main > section:not(#demonstracao):not(#resultado), footer')]
        .map((e) => (e as HTMLElement).innerText)
        .join('\n'),
    ),
  );
  expect(fora.match(/R\$\s?[\d.,]+/g)).toEqual([reais(vendido.preco_mensal_centavos)]);
  for (const p of planos.filter((x) => x.codigo !== vendido.codigo)) {
    expect(fora).not.toContain(reais(p.preco_mensal_centavos));
  }
  expect(fora).not.toMatch(/anual|por ano|fundador/i);
});

test('demonstração: convidados, pacote e extras mudam o valor na hora, e o pedido chega igual', async ({
  page,
}) => {
  const enviados: string[] = [];
  page.on('request', (r) => {
    if (ehEnvio(r.method(), r.url())) enviados.push(r.url());
  });
  await irParaDemonstracao(page);
  const demo = page.getByTestId('demonstracao');
  const total = page.getByTestId('demo-total');
  const lerTotal = async () => normal(await total.innerText());

  await expect(demo).toContainText('Buffet Exemplo');
  await expect(page.getByTestId('demo-passo')).toHaveText('Passo 1 de 2 · Pacote');
  await expect(total).toHaveText(/^Total R\$\s?[\d.]+,\d{2}$/);

  // convidados: o mesmo contador do link público (aqui de 10 em 10)
  const inicial = await lerTotal();
  await demo.getByRole('button', { name: 'Aumentar convidados' }).click();
  await expect(demo.getByRole('spinbutton', { name: 'Convidados' })).toHaveValue('60');
  await expect(total).not.toHaveText(inicial);
  await expect(page.getByTestId('demo-resumo')).toContainText('60 convidados');

  // pacote: os cartões do passo real, cada um com o total para esta festa
  const pacotes = demo.getByTestId('opcao-pacote');
  await expect(pacotes).toHaveCount(3);
  const porPacote = new Set<string>();
  for (const nome of ['Alegria', 'Super', 'Encanto']) {
    const cartao = pacotes.filter({ hasText: nome });
    await cartao.click();
    await expect(cartao).toHaveAttribute('aria-checked', 'true');
    const valor = await lerTotal();
    expect(normal(await cartao.innerText())).toContain(valor.replace('Total ', ''));
    porPacote.add(valor);
  }
  expect(porPacote.size).toBe(3);

  // extras: o passo real, somando ao total
  await pacotes.filter({ hasText: 'Super' }).click();
  const semExtra = await lerTotal();
  await demo.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByTestId('demo-passo')).toHaveText('Passo 2 de 2 · Extras');
  await demo.getByRole('checkbox', { name: /Mesa temática/ }).click();
  await expect(total).not.toHaveText(semExtra);
  const final = (await lerTotal()).replace('Total ', '');

  // resultado: o pedido como o dono recebe, com data, convidados, pacote, extra e o mesmo valor
  await demo.getByRole('button', { name: 'Ver como o buffet recebe' }).click();
  const pedido = page.getByTestId('pedido');
  await expect(pedido).toBeInViewport();
  await expect(page.locator('#resultado')).toHaveAttribute('data-chegou', 'true');
  await expect(pedido).toContainText('WhatsApp');
  await expect(pedido).toContainText('Aniversário infantil');
  await expect(pedido).toContainText(/Sáb, \d{2}\/\d{2} · Tarde/);
  await expect(pedido).toContainText('60 convidados');
  await expect(pedido).toContainText('Pacote Super');
  await expect(pedido).toContainText('Mesa temática');
  expect(normal(await page.getByTestId('pedido-total').innerText())).toBe(final);

  // voltar e trocar: o pedido acompanha
  await demo.getByRole('button', { name: 'Voltar ao passo anterior' }).click();
  await pacotes.filter({ hasText: 'Alegria' }).click();
  await expect(pedido).toContainText('Pacote Alegria');

  // nada da demonstração foi enviado ao servidor (não gera lead, reserva nem número)
  expect(enviados).toEqual([]);
  expect(await semRolagemHorizontal(page)).toBe(true);
});

test('destinos: Entrar e o botão final; nenhum link quebrado', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('entrar')).toHaveAttribute('href', '/login');
  const final = page.getByRole('link', { name: 'Quero isso com o nome do meu buffet' });
  await expect(final).toHaveAttribute('href', '/cadastro');
  await expect(final).toHaveAttribute('data-cta-teste');
  // nenhum link sem destino e nenhuma âncora para seção que não existe
  const quebrados = await page.evaluate(() =>
    [...document.querySelectorAll('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter(
        (h) => !h || h === '#' || (h.startsWith('#') && !document.getElementById(h.slice(1))),
      ),
  );
  expect(quebrados).toEqual([]);
});

test('o botão final leva ao cadastro mínimo e a conta nasce com a origem do anúncio', async ({
  page,
}) => {
  await page.goto('/?utm_source=Instagram&utm_campaign=lancamento&ref=bio');
  await page.getByRole('link', { name: 'Quero isso com o nome do meu buffet' }).click();
  await expect(page).toHaveURL(/\/cadastro$/);

  // só o mínimo: nome, nome do buffet, WhatsApp, e-mail e senha (mais o aceite dos termos)
  const campos = page.locator('form').locator('input:not([type="checkbox"])');
  await expect(campos).toHaveCount(5);
  await expect(page.getByLabel('WhatsApp (com DDD)')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);

  // WhatsApp é obrigatório e precisa do DDD
  await page.getByLabel('Seu nome').fill('Lia Landing');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Informe seu WhatsApp')).toBeVisible();
  await page.getByLabel('WhatsApp (com DDD)').fill('99135-5450');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Informe um celular válido com DDD')).toBeVisible();

  const email = emailUnico('landing');
  await cadastrar(page, {
    nome: 'Lia Landing',
    email,
    whatsapp: '34991355450',
    senha: 'senha-boa-123',
    buffet: `Buffet Landing ${Date.now()}`,
  });
  await expect(page).toHaveURL(/\/app\/comecar/);
  const origem = await noBanco(async (sql) => {
    const [l] = await sql<{ o: Record<string, string> | null }[]>`
      select e.origem_cadastro as o from public.empresas e
      join public.usuarios u on u.empresa_id = e.id where u.email = ${email}`;
    return l!.o;
  });
  expect(origem).toEqual({ utm_source: 'instagram', utm_campaign: 'lancamento', ref: 'bio' });
});

test('nada inventado e nenhum travessão na página', async ({ page }) => {
  await page.goto('/');
  const texto = (await page.locator('body').innerText()).toLowerCase();
  expect(texto).not.toMatch(/depoimento|avalia[çc][ãa]o|estrelas|clientes satisfeitos/);
  expect(texto).not.toMatch(/mais de \d+\s*(buffets|clientes)/);
  expect(texto).not.toMatch(/você só entra quando ele quer reservar/);
  expect(texto).not.toMatch(/[—–]/);
  // o exemplo é identificado como exemplo
  await expect(page.getByText(/Valores fictícios/)).toBeVisible();
  await expect(page.locator('img, video')).toHaveCount(0);
});

test('logado, o topo leva ao painel', async ({ page }) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  await page.goto('/');
  await expect(page.getByTestId('ir-para-painel')).toBeVisible();
  await page.getByTestId('ir-para-painel').click();
  await expect(page).toHaveURL(/\/app\/leads$/);
});

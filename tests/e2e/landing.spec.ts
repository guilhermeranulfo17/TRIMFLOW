import { expect, test } from '@playwright/test';
import { noBanco } from './banco';
import { cadastrar, emailUnico, entrar, SENHA_SEED, semRolagemHorizontal } from './helpers';

/*
 * Etapa 9.6: landing em `/`. Preços vêm do banco (publico.planos_vitrine), o simulador roda no
 * navegador, a origem do anúncio vai para empresas.origem_cadastro e a página não toca no Auth.
 */

const brl = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(centavos / 100)
    .replace(/ /g, ' ');
const normal = (s: string) => s.replace(/ /g, ' ');

test('é a landing (sem redirecionar) e não chama o Auth', async ({ page }) => {
  const auth: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/auth/v1')) auth.push(r.url());
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Seu cliente monta o orçamento. Você acompanha até a festa fechada.',
  );
  await page.waitForLoadState('networkidle');
  expect(auth).toEqual([]);
  expect(await semRolagemHorizontal(page)).toBe(true);
});

test('planos: preços, limites e contratos do banco; anual mostra o mensal equivalente e o total', async ({
  page,
}) => {
  const { planos } = await noBanco(async (sql) => ({
    planos: await sql<
      {
        codigo: string;
        preco_mensal_centavos: number;
        preco_anual_centavos: number;
        max_usuarios: number;
        contratos_mes: number | null;
      }[]
    >`select codigo, preco_mensal_centavos, preco_anual_centavos, max_usuarios, contratos_mes
      from public.planos where ativo order by ordem`,
  }));
  await page.goto('/#planos');
  for (const p of planos) {
    const cartao = page.getByTestId(`plano-${p.codigo}`);
    await expect(cartao.getByTestId('preco')).toHaveText(brl(p.preco_mensal_centavos), {
      useInnerText: true,
    });
    await expect(cartao).toContainText(`Até ${p.max_usuarios} usuários`);
    await expect(cartao).toContainText(
      p.contratos_mes === null ? 'sem limite' : `até ${p.contratos_mes} por mês`,
    );
    await expect(cartao.getByTestId('total-anual')).toHaveCount(0);
  }
  await expect(page.getByText(/fundador/i)).toHaveCount(0);

  // seletor mensal/anual: clique e setas do teclado
  await page.getByTestId('ciclo-anual').click();
  await expect(page.getByTestId('ciclo-anual')).toHaveAttribute('aria-checked', 'true');
  for (const p of planos) {
    const cartao = page.getByTestId(`plano-${p.codigo}`);
    const preco = await cartao.getByTestId('preco').innerText();
    expect(normal(preco)).toBe(brl(Math.floor((p.preco_anual_centavos * 2 + 12) / 24)));
    expect(normal(await cartao.getByTestId('total-anual').innerText())).toContain(
      brl(p.preco_anual_centavos),
    );
  }
  await expect(page.getByTestId('selo-anual')).toHaveText(/\d+ (mês|meses) grátis/);
  await page.getByTestId('ciclo-anual').press('ArrowLeft');
  await expect(page.getByTestId('ciclo-mensal')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('ciclo-mensal')).toBeFocused();
});

test('"Experimentar o orçamento" leva à demonstração, que recalcula no navegador', async ({
  page,
}) => {
  const enviados: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && !r.url().includes('/api/landing/contar')) enviados.push(r.url());
  });
  await page.goto('/');
  await page.getByTestId('experimentar-orcamento').click();
  await expect(page).toHaveURL(/#demonstracao$/);
  await expect(page.locator('#titulo-demo')).toBeInViewport();
  const total = page.getByTestId('simulador-total');
  const lerTotal = async () => normal(await total.innerText());

  // convidados pelo teclado (deslizante) e pelos botões
  const inicial = await lerTotal();
  const deslizante = page.getByRole('slider', { name: 'Convidados' });
  await deslizante.focus();
  await deslizante.press('ArrowRight');
  await expect(page.getByTestId('simulador-convidados')).toHaveText('55');
  await page.getByRole('button', { name: 'Mais 5 convidados' }).click();
  await expect(page.getByTestId('simulador-convidados')).toHaveText('60');
  await expect(page.getByTestId('simulador-resumo')).toContainText('60 convidados');

  // pacotes diferentes mudam o total; troca pelo teclado (setas no grupo de rádios)
  const pacote = (nome: string) => page.getByRole('radio', { name: nome, exact: true });
  const porPacote = new Map<string, string>();
  await pacote('Super').focus();
  for (const [tecla, nome] of [
    ['ArrowLeft', 'Alegria'],
    ['ArrowRight', 'Super'],
    ['ArrowRight', 'Encanto'],
  ] as const) {
    await page.keyboard.press(tecla);
    await expect(pacote(nome)).toBeChecked();
    await expect(page.getByTestId('simulador-resumo')).toContainText(`Pacote ${nome}`);
    porPacote.set(nome, await lerTotal());
  }
  expect(new Set(porPacote.values()).size).toBe(3);
  expect(inicial).not.toBe(porPacote.get('Encanto'));

  // adicional (espaço no checkbox) soma o valor; crianças de 6 a 10 entram no resumo
  await page.keyboard.press('ArrowLeft');
  await expect(pacote('Super')).toBeChecked();
  const semMesa = await lerTotal();
  const mesa = page.getByRole('checkbox', { name: /Mesa temática/ });
  await mesa.focus();
  await page.keyboard.press('Space');
  await expect(mesa).toBeChecked();
  await expect(total).not.toHaveText(semMesa);
  await page.getByRole('button', { name: 'Mais uma criança' }).click();
  await expect(page.getByTestId('simulador-criancas')).toHaveText('1');
  await expect(page.getByTestId('simulador-resumo')).toContainText('59 adultos e 1 crianças');
  await expect(total).toHaveText(/^R\$\s?[\d.]+,\d{2}$/);
  await expect(page.getByTestId('simulador-sinal')).toHaveText(/^R\$\s?[\d.]+,\d{2}$/);
  await expect(page.getByText(/Valores fictícios/)).toBeVisible();

  // CTA depois da interação vai ao cadastro; nada da demonstração foi enviado ao servidor
  await expect(page.getByRole('link', { name: 'Quero usar com os meus pacotes' })).toHaveAttribute(
    'href',
    '/cadastro',
  );
  expect(enviados).toEqual([]);
  expect(await semRolagemHorizontal(page)).toBe(true);
});

test('navegação por âncoras do cabeçalho; no celular o menu fecha ao escolher', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const secoes = [
    ['Como funciona', 'como-funciona'],
    ['Recursos', 'recursos'],
    ['Planos', 'planos'],
    ['Dúvidas', 'duvidas'],
  ] as const;
  for (const [rotulo, id] of secoes) {
    if (isMobile) {
      await page.getByLabel('Menu de seções').click();
      await expect(page.getByTestId('menu-celular')).toHaveAttribute('open', '');
    }
    await page
      .getByRole('banner')
      .getByRole('link', { name: rotulo, exact: true })
      .and(page.locator(':visible'))
      .click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(`#${id}`)).toBeInViewport();
    if (isMobile) await expect(page.getByTestId('menu-celular')).not.toHaveAttribute('open');
  }
  // âncoras antigas continuam abrindo a seção certa
  await page.goto('/#precos');
  await expect(page.getByTestId('plano-essencial')).toBeVisible();
});

test('dúvidas abrem e fecham pelo teclado e levam aos documentos', async ({ page }) => {
  await page.goto('/#duvidas');
  const pergunta = page.locator('summary', { hasText: 'Como funciona o contrato eletrônico?' });
  const resposta = page.getByText(/assinatura eletrônica simples/);
  await expect(resposta).toBeHidden();
  await pergunta.focus();
  await page.keyboard.press('Enter');
  await expect(resposta).toBeVisible();
  await expect(resposta).toContainText('ICP-Brasil');
  await page.keyboard.press('Enter');
  await expect(resposta).toBeHidden();

  await page.locator('summary', { hasText: 'E os dados dos meus clientes?' }).click();
  const duvidas = page.getByTestId('duvidas');
  await expect(duvidas.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute(
    'href',
    '/privacidade',
  );
  await expect(duvidas.getByRole('link', { name: 'Termos de uso' })).toHaveAttribute(
    'href',
    '/termos',
  );
});

test('destinos: Entrar, Testar grátis e WhatsApp de vendas', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Entrar', exact: true }),
  ).toHaveAttribute('href', '/login');
  const testar = page.locator('a[data-cta-teste]');
  expect(await testar.count()).toBeGreaterThan(3);
  for (const href of await testar.evaluateAll((as) => as.map((a) => a.getAttribute('href'))))
    expect(href).toBe('/cadastro');
  const numero = process.env.NEXT_PUBLIC_WHATSAPP_VENDAS?.replace(/\D/g, '');
  const whats = page.locator('a[href^="https://wa.me/"]');
  if (numero) {
    expect(await whats.count()).toBeGreaterThan(0);
    for (const href of await whats.evaluateAll((as) => as.map((a) => a.getAttribute('href'))))
      expect(href).toMatch(new RegExp(`^https://wa\\.me/${numero}\\?text=`));
  } else {
    await expect(whats).toHaveCount(0);
  }
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

test('"Testar grátis" leva ao cadastro e a conta nasce com a origem do anúncio', async ({
  page,
}) => {
  await page.goto('/?utm_source=Instagram&utm_campaign=lancamento&ref=bio');
  await page
    .getByRole('main')
    .getByRole('link', { name: /Testar 14 dias grátis/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/cadastro$/);
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

test('botão de exemplo só com NEXT_PUBLIC_DEMO_SLUG; nada inventado na página', async ({
  page,
}) => {
  await page.goto('/');
  const demo = process.env.NEXT_PUBLIC_DEMO_SLUG;
  if (demo) {
    await expect(page.getByTestId('ver-exemplo')).toHaveAttribute('href', `/b/${demo}`);
  } else {
    await expect(page.getByTestId('ver-exemplo')).toHaveCount(0);
  }
  const texto = (await page.locator('body').innerText()).toLowerCase();
  expect(texto).not.toMatch(/depoimento|avalia[çc][ãa]o|estrelas|clientes satisfeitos/);
  expect(texto).not.toMatch(/mais de \d+\s*(buffets|clientes)/);
  expect(texto).not.toMatch(/você só entra quando ele quer reservar/);
  // as telas do produto são desenhos com dados fictícios, identificados como exemplo
  await expect(page.getByText('Exemplo ilustrativo', { exact: true })).toHaveCount(3);
  await expect(page.getByText('Números de demonstração', { exact: true })).toHaveCount(3);
});

test('logado, o cabeçalho leva ao painel', async ({ page }) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  await page.goto('/');
  await expect(page.getByTestId('ir-para-painel')).toBeVisible();
  await page.getByTestId('ir-para-painel').click();
  await expect(page).toHaveURL(/\/app\/leads$/);
});

test('cabeçalho ganha fundo ao rolar; no celular, a barra "Testar grátis" aparece depois do hero', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const cabecalho = page.getByTestId('cabecalho-landing');
  const barra = page.getByTestId('barra-teste-celular');
  await expect(cabecalho).toHaveAttribute('data-rolou', 'false');
  await expect(barra).toHaveAttribute('data-visivel', 'false');
  await page.mouse.wheel(0, 3000);
  await expect(cabecalho).toHaveAttribute('data-rolou', 'true');
  await expect(barra).toHaveAttribute('data-visivel', 'true');
  if (isMobile)
    await expect(barra.getByRole('link', { name: /Testar 14 dias grátis/ })).toBeVisible();
  await page.mouse.wheel(0, -3000);
  await expect(barra).toHaveAttribute('data-visivel', 'false');
});

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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'O cliente monta o orçamento sozinho.',
  );
  await page.waitForLoadState('networkidle');
  expect(auth).toEqual([]);
  expect(await semRolagemHorizontal(page)).toBe(true);
});

test('preços, limites e vagas do FUNDADOR são os do banco; mensal e anual', async ({ page }) => {
  const { planos, cupom } = await noBanco(async (sql) => ({
    planos: await sql<
      {
        codigo: string;
        preco_mensal_centavos: number;
        preco_anual_centavos: number;
        max_usuarios: number;
      }[]
    >`select codigo, preco_mensal_centavos, preco_anual_centavos, max_usuarios
      from public.planos where ativo order by ordem`,
    cupom: (
      await sql<{ max_usos: number; usos: number }[]>`
        select max_usos, usos from public.cupons where codigo = 'FUNDADOR'`
    )[0]!,
  }));
  await page.goto('/#precos');
  for (const p of planos) {
    const cartao = page.getByTestId(`plano-${p.codigo}`);
    await expect(cartao.getByTestId('preco')).toHaveText(brl(p.preco_mensal_centavos), {
      useInnerText: true,
    });
    await expect(cartao).toContainText(`Até ${p.max_usuarios} usuários`);
  }
  await expect(page.getByTestId('faixa-fundador')).toContainText(
    `restam ${cupom.max_usos - cupom.usos} de ${cupom.max_usos}`,
  );

  await page.getByTestId('ciclo-anual').click();
  await expect(page.getByTestId('ciclo-anual')).toHaveAttribute('aria-checked', 'true');
  for (const p of planos) {
    const preco = await page.getByTestId(`plano-${p.codigo}`).getByTestId('preco').innerText();
    expect(normal(preco)).toBe(brl(p.preco_anual_centavos));
  }
  await expect(page.getByTestId('selo-anual')).toHaveText(/\d+ (mês|meses) grátis/);
});

test('simulador recalcula no navegador, também pelo teclado', async ({ page }) => {
  await page.goto('/');
  const total = page.getByTestId('simulador-total');
  await total.scrollIntoViewIfNeeded();
  const antes = await total.innerText();
  const deslizante = page.getByRole('slider', { name: 'Convidados' });
  await deslizante.focus();
  await deslizante.press('ArrowRight');
  await expect(page.getByTestId('simulador-convidados')).toHaveText('55');
  await page.getByText('Encanto', { exact: true }).click();
  await expect(total).not.toHaveText(antes);
  await expect(total).toHaveText(/^R\$\s?[\d.]+,\d{2}$/);
  await expect(page.getByText('Exemplo com preços fictícios.')).toBeVisible();
});

test('abas "Para quem é" pelo teclado', async ({ page }) => {
  await page.goto('/#para-quem');
  const primeira = page.getByRole('tab', { name: 'Infantil' });
  await primeira.focus();
  await primeira.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'A domicílio' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tabpanel')).toContainText('Buffet a domicílio');
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
    segmento: 'Buffet infantil',
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

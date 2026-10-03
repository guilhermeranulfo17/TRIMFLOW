import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import { noBanco, zerarLimites } from './banco';
import {
  cadastrar,
  confirmarPrecosNoOnboarding,
  emailUnico,
  semRolagemHorizontal,
} from './helpers';

/*
 * Etapa 9.5 · PR 2: página pública do buffet. Editor (salvar, prévia, publicar), vitrine em 3
 * larguras, carrossel e lightbox, seções vazias que somem e nada de depoimento ou avaliação sem
 * cadastro do dono. Com CAPTURAS=1, salva as telas em docs/capturas/etapa-9-5b.
 */

test.beforeAll(async () => {
  await zerarLimites();
});

async function empresaPronta(page: Page, buffet: string): Promise<string> {
  await cadastrar(page, {
    nome: 'Dona Página',
    email: emailUnico('pagina'),
    whatsapp: '34991355450',
    senha: 'senha-forte-123',
    buffet,
    segmento: 'Buffet infantil',
  });
  await expect(page).toHaveURL(/\/app\/comecar$/);
  await confirmarPrecosNoOnboarding(page);
  await page.goto('/app/empresa/link');
  return (await page.getByTestId('link-principal').innerText()).split('/b/')[1]!;
}

async function visitante(browser: Browser, largura = 375, altura = 812): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: 1,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
  });
  return ctx.newPage();
}

async function esperarToast(page: Page, texto: string) {
  await expect(page.getByTestId('toast').filter({ hasText: texto })).toBeVisible();
}

const foto = (cor: string) =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: cor } })
    .png()
    .toBuffer();

test.describe('página pública', () => {
  // cadastro + onboarding + editor: mais longo que o padrão
  test.describe.configure({ timeout: 120_000 });

  test('editor: salvar, ver na prévia e publicar no link', async ({ page, browser }) => {
    const slug = await empresaPronta(page, 'Buffet Página Um');

    // apresentação e estilo
    await page.getByLabel('Frase de apresentação').fill('A festa mais feliz da cidade');
    await page.getByTestId('estilo-elegante').click();
    await page.getByLabel('Novo diferencial').fill('Espaço próprio');
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await page.getByLabel('Bairro', { exact: true }).fill('Centro');
    await page.locator('#pagina-textos').getByRole('button', { name: 'Salvar' }).click();
    await esperarToast(page, 'Página atualizada.');

    // galeria: duas fotos (convertidas para WEBP em 640 e 1280 no navegador); o Storage do
    // Supabase só roda no CI (E2E_STORAGE), como no teste de upload de Minha empresa
    const comStorage = !!process.env.E2E_STORAGE;
    if (comStorage) {
      await page.getByTestId('entrada-galeria').setInputFiles([
        { name: 'salao.png', mimeType: 'image/png', buffer: await foto('#0f766e') },
        { name: 'mesa.png', mimeType: 'image/png', buffer: await foto('#f59e0b') },
      ]);
      await esperarToast(page, '2 fotos enviadas.');
      await expect(page.getByTestId('foto-editor')).toHaveCount(2);
      await page
        .getByLabel('Descrição da foto (para leitores de tela)')
        .first()
        .fill('Salão decorado');
      await page.getByRole('button', { name: 'Salvar galeria' }).click();
      await esperarToast(page, 'Galeria salva.');
    }

    // depoimento e pergunta do dono
    await page.getByRole('button', { name: 'Adicionar depoimento' }).click();
    await page.getByLabel('Nome do cliente', { exact: true }).fill('Patrícia');
    await page.getByLabel('O que o cliente disse').fill('Festa linda, equipe nota dez!');
    await page.locator('#pagina-depoimentos').getByRole('button', { name: 'Salvar' }).click();
    await esperarToast(page, 'Depoimentos salvos.');
    await page.getByRole('button', { name: 'Adicionar pergunta' }).click();
    await page.getByLabel('Pergunta', { exact: true }).fill('Tem estacionamento?');
    await page.getByLabel('Resposta', { exact: true }).fill('Sim, gratuito.');
    await page.locator('#pagina-perguntas').getByRole('button', { name: 'Salvar' }).click();
    await esperarToast(page, 'Perguntas salvas.');

    // prévia (celular: botão "Ver prévia" abre o iframe em modo teste)
    await page.getByRole('button', { name: 'Ver prévia' }).click();
    const previa = page.frameLocator('[data-testid="previa-pagina"]');
    await expect(previa.getByTestId('slogan')).toHaveText('A festa mais feliz da cidade');
    await expect(previa.getByText('Modo teste: nada aqui conta nas métricas')).toBeVisible();
    await page.getByRole('button', { name: 'Fechar prévia' }).click();

    // publicado: o cliente vê tudo
    const cliente = await visitante(browser);
    await cliente.goto(`/b/${slug}`);
    await expect(cliente.locator('[data-estilo]').first()).toHaveAttribute(
      'data-estilo',
      'elegante',
    );
    await expect(cliente.getByTestId('slogan')).toHaveText('A festa mais feliz da cidade');
    await expect(cliente.getByText('Espaço próprio')).toBeVisible();
    await expect(cliente.getByText('Festa linda, equipe nota dez!')).toBeVisible();
    if (comStorage) {
      await expect(cliente.getByRole('button', { name: 'Ampliar: Salão decorado' })).toBeVisible();
      await expect(cliente.getByTestId('foto-galeria')).toHaveCount(2);
    }
    await cliente.getByText('Tem estacionamento?').click();
    await expect(cliente.getByText('Sim, gratuito.')).toBeVisible();
    expect(await semRolagemHorizontal(cliente)).toBe(true);
  });

  test('carrossel, gaveta do pacote e lightbox (teclado e foco)', async ({ page, browser }) => {
    const slug = await empresaPronta(page, 'Buffet Página Dois');
    // fotos da galeria e dos pacotes direto no banco (o editor já foi testado acima)
    await noBanco(async (sql) => {
      const [e] = await sql<{ id: string }[]>`select id from public.empresas where slug = ${slug}`;
      const fotos = [1, 2, 3].map((n) => ({
        c640: `${e!.id}/galeria/00000000-0000-4000-8000-00000000000${n}-640.webp`,
        c1280: `${e!.id}/galeria/00000000-0000-4000-8000-00000000000${n}-1280.webp`,
      }));
      for (const [i, f] of fotos.entries()) {
        await sql`insert into public.galeria_fotos (empresa_id, caminho_640, caminho_1280, largura, altura, alt, ordem)
          values (${e!.id}, ${f.c640}, ${f.c1280}, 1280, 853, ${`Foto ${i + 1}`}, ${i})`;
      }
      await sql`update public.pacotes set fotos = ${sql.json(fotos.slice(0, 2).map((f) => f.c1280))}
        where empresa_id = ${e!.id}`;
    });

    // a vitrine fica em cache pela tag do buffet: salvar no editor invalida, como na vida real
    await page.locator('#pagina-textos').getByRole('button', { name: 'Salvar' }).click();
    await esperarToast(page, 'Página atualizada.');

    const cliente = await visitante(browser);
    await cliente.goto(`/b/${slug}`);

    // carrossel: setas do teclado rolam o trilho
    const carrossel = cliente.getByRole('region', { name: /^Fotos de / }).first();
    const trilho = carrossel.locator('.carrossel');
    await trilho.focus();
    await cliente.keyboard.press('ArrowRight');
    await expect.poll(() => trilho.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

    // gaveta: detalhes do pacote e "Orçar este pacote" leva o pacote ao orçamento
    await cliente.getByRole('button', { name: 'Ver detalhes' }).first().click();
    const gaveta = cliente.getByTestId('gaveta-pacote');
    await expect(gaveta.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(gaveta.getByRole('link', { name: 'Orçar este pacote' })).toHaveAttribute(
      'href',
      /pacote=/,
    );
    await cliente.keyboard.press('Escape');
    await expect(gaveta).not.toBeVisible();

    // lightbox: abre na foto, setas e Esc; o foco volta para a foto
    await cliente.getByRole('button', { name: 'Ampliar: Foto 1' }).click();
    const lightbox = cliente.getByTestId('lightbox');
    await expect(lightbox.getByText('1 de 3')).toBeVisible();
    await cliente.keyboard.press('ArrowRight');
    await expect(lightbox.getByText('2 de 3')).toBeVisible();
    await cliente.keyboard.press('ArrowLeft');
    await cliente.keyboard.press('ArrowLeft');
    await expect(lightbox.getByText('3 de 3')).toBeVisible();
    await cliente.keyboard.press('Escape');
    await expect(lightbox).not.toBeVisible();
    await expect(cliente.getByRole('button', { name: 'Ampliar: Foto 3' })).toBeFocused();
  });

  test('seções vazias somem e nada de depoimento ou avaliação sem cadastro', async ({
    page,
    browser,
  }) => {
    const slug = await empresaPronta(page, 'Buffet Página Três');
    const cliente = await visitante(browser);
    await cliente.goto(`/b/${slug}`);
    await expect(
      cliente.getByRole('heading', { name: 'Buffet Página Três', level: 1 }),
    ).toBeVisible();
    for (const secao of ['galeria', 'diferenciais', 'depoimentos', 'onde-fica']) {
      await expect(cliente.locator(`[data-secao="${secao}"]`)).toHaveCount(0);
    }
    // perguntas automáticas saem dos dados reais
    await expect(cliente.locator('[data-secao="perguntas"]')).toContainText(
      'Quanto tempo dura a festa?',
    );
    const html = await cliente.content();
    expect(html).not.toMatch(/aggregateRating|ratingValue|"review"|estrelas/i);
    const ld = await cliente.locator('script[type="application/ld+json"]').textContent();
    expect(JSON.parse(ld!)).toMatchObject({ '@type': 'LocalBusiness', name: 'Buffet Página Três' });
  });

  test('vitrine em 390, 768 e 1440 sem rolagem horizontal', async ({ browser }, info) => {
    const pasta = 'docs/capturas/etapa-9-5b';
    if (process.env.CAPTURAS === '1') mkdirSync(pasta, { recursive: true });
    for (const largura of [390, 768, 1440]) {
      const cliente = await visitante(browser, largura, largura === 1440 ? 900 : 844);
      await cliente.goto('/b/buffet-demo');
      await expect(cliente.getByRole('heading', { name: 'Buffet Demo', level: 1 })).toBeVisible();
      await expect(cliente.getByTestId('pacote-publico').first()).toBeVisible();
      expect(await semRolagemHorizontal(cliente), `rolagem em ${largura}`).toBe(true);
      // rola até o fim para as fotos com loading="lazy" carregarem antes da captura
      await cliente.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await cliente.waitForLoadState('networkidle');
      const imagem = await cliente.screenshot({ fullPage: true });
      await info.attach(`vitrine-${largura}`, { body: imagem, contentType: 'image/png' });
      if (process.env.CAPTURAS === '1') {
        await cliente.screenshot({
          path: `${pasta}/vitrine-${largura}.jpg`,
          fullPage: true,
          type: 'jpeg',
          quality: 75,
        });
      }
      await cliente.context().close();
    }
  });
});

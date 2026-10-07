import { expect, test, type Page } from '@playwright/test';
import { noBanco } from './banco';
import {
  API_FALSA,
  cliente,
  enviarContrato,
  orcamentoAceito,
  preencherAssinatura,
} from './contratos-apoio';
import { entrar, semRolagemHorizontal, SENHA_SEED } from './helpers';

/*
 * Etapa 10 (PR 2): a jornada completa do contrato no painel. O dono envia com a cópia por
 * e-mail; o cliente abre e assina; o dono recebe o aviso, acha o contrato na lista, vê o
 * histórico, o CPF completo e baixa o PDF; o cliente recebe a cópia com o PDF em anexo. Depois:
 * pedir ajuste e refazer, lembrar com link novo, cancelar, modelos e o que o vendedor vê.
 */

/** Contador do sino (0 sem o selo). Força a consulta disparando o "voltar para a aba". */
async function contadorDoSino(page: Page): Promise<number> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const selo = page.getByTestId('contador-avisos');
  if (!(await selo.isVisible())) return 0;
  const t = (await selo.innerText()).trim();
  return t === '99+' ? 100 : Number(t);
}

test.describe('contrato no painel', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(() =>
    noBanco((sql) => sql`delete from publico.tentativas where acao like 'contrato%'`),
  );

  test('jornada: envia com cópia, cliente assina, aviso no sino, lista, detalhe, CPF e PDF', async ({
    page,
    browser,
  }) => {
    const email = `copia-${Date.now()}@exemplo.com`;
    const o = await orcamentoAceito(email);
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    await expect(page.getByTestId('sino')).toHaveCount(1);
    const antes = await contadorDoSino(page);
    const link = await enviarContrato(page, o.id, false, { copiaEmail: true });

    // "Ver o contrato" logo depois do envio: aguardando, sem abrir ainda
    await page.getByRole('link', { name: 'Ver o contrato' }).click();
    await expect(page).toHaveURL(/\/app\/contratos\/[0-9a-f-]{36}$/);
    const urlDetalhe = page.url();
    await expect(page.getByTestId('selo-contrato').first()).toHaveText('Aguardando assinatura');
    await expect(page.getByTestId('historico-contrato')).toContainText(
      'assinou pelo buffet e enviou',
    );

    const c = await cliente(browser);
    await c.goto(link);
    await preencherAssinatura(c, 'Cliente Jornada Completa');
    await c.getByTestId('assinar-contrato').click();
    await expect(c.getByTestId('contrato-concluido')).toBeVisible();

    // cópia ao cliente: e-mail com o PDF em anexo (sai logo depois da resposta)
    await expect
      .poll(
        async () => {
          const r = await c.request.get(
            `${API_FALSA}/resend/ultimo?para=${encodeURIComponent(email)}`,
          );
          if (r.status() !== 200) return null;
          const e = (await r.json()) as {
            subject: string;
            attachments?: { filename: string; content: string }[];
          };
          return {
            assunto: e.subject,
            anexos: e.attachments?.length ?? 0,
            pdf: e.attachments?.[0],
          };
        },
        { timeout: 20_000 },
      )
      .toMatchObject({ assunto: expect.stringContaining('cópia assinada'), anexos: 1 });
    await c.context().close();

    // o sino do dono sobe (abriu e assinou) e o aviso leva ao contrato
    await expect(async () => {
      expect(await contadorDoSino(page)).toBeGreaterThan(antes);
    }).toPass({ timeout: 30_000 });
    await page.getByTestId('sino').click();
    const aviso = page
      .getByTestId('item-aviso')
      .filter({ hasText: `Contrato assinado: ${o.nome}` });
    await expect(aviso).toBeVisible();
    await aviso.click();
    await expect(page).toHaveURL(urlDetalhe);

    // detalhe: assinado, histórico completo, CPF completo (fica registrado) e PDF
    await expect(page.getByTestId('faixa-assinado')).toContainText('cópia foi enviada');
    const historico = page.getByTestId('historico-contrato');
    await expect(historico).toContainText('Cliente abriu o contrato');
    await expect(historico).toContainText('Cliente assinou');
    await expect(historico).toContainText('Cópia assinada enviada ao e-mail do cliente');
    await expect(page.getByTestId('assinaturas')).toContainText('***.982.247-**');
    await page.getByTestId('ver-cpf').click();
    await expect(page.getByTestId('cpf-completo')).toHaveText('529.982.247-25');
    await expect(historico).toContainText('viu o CPF completo');
    expect(await semRolagemHorizontal(page)).toBe(true);
    const href = await page.getByTestId('baixar-pdf-contrato').getAttribute('href');
    const pdf = await page.request.get(href!);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    // lista: está em "Assinados" e abre o detalhe; o lead mostra o contrato
    await page.goto('/app/contratos');
    await page.getByTestId('filtro-contrato-assinados').click();
    await expect(page).toHaveURL(/status=assinados/);
    const item = page.getByTestId('item-contrato').filter({ hasText: o.nome });
    await expect(item).toBeVisible();
    await expect(item.getByTestId('selo-contrato')).toHaveText('Concluído');
    await item.click();
    await expect(page).toHaveURL(urlDetalhe);
    await page.getByTestId('abrir-lead').click();
    await expect(page.getByTestId('contratos-lead')).toContainText('Concluído');
  });

  test('pedir ajuste e refazer: versão 2 e o anterior cancelado', async ({ page, browser }) => {
    const o = await orcamentoAceito(null);
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    const link = await enviarContrato(page, o.id, false);
    await page.getByRole('link', { name: 'Ver o contrato' }).click();
    await expect(page).toHaveURL(/\/app\/contratos\/[0-9a-f-]{36}$/);
    const urlAnterior = page.url();

    const c = await cliente(browser);
    await c.goto(link);
    await c.getByRole('button', { name: 'Não concordo / Pedir ajuste' }).click();
    await c.getByLabel('O que precisa mudar? (opcional)').fill('Trocar o horário para as 16h');
    await c.getByTestId('confirmar-ajuste').click();
    await expect(c.getByTestId('contrato-recusado')).toBeVisible();

    await page.goto('/app/contratos?status=ajuste');
    await page.getByTestId('item-contrato').filter({ hasText: o.nome }).click();
    await expect(page.getByTestId('faixa-ajuste')).toContainText('Trocar o horário para as 16h');
    await page.getByTestId('refazer-contrato').click();
    await expect(page).toHaveURL(/\/app\/contratos\/novo\?orcamento=.+&substitui=/);
    await expect(page.getByText(/Este contrato substitui o \d{4}-\d{4}/)).toBeVisible();
    for (const campo of await page.locator('[data-variavel]').all()) {
      if (!(await campo.inputValue())) await campo.fill('Informação de teste');
    }
    await page.getByTestId('enviar-contrato').click();
    await expect(page.getByTestId('contrato-enviado')).toBeVisible();
    const novoLink = (await page.getByTestId('link-contrato').getAttribute('href'))!;

    await page.getByRole('link', { name: 'Ver o contrato' }).click();
    await expect(page.getByText(/versão 2/).first()).toBeVisible();
    await page.goto(urlAnterior);
    await expect(page.getByTestId('selo-contrato').first()).toHaveText('Cancelado');
    await expect(page.getByText(/Substituído pelo/)).toBeVisible();

    // o link novo abre; o antigo mostra o pedido de ajuste (não dá mais para assinar)
    await c.goto(novoLink);
    await expect(c.getByRole('heading', { name: 'Leia e assine o seu contrato' })).toBeVisible();
  });

  test('lembrar com link novo (o antigo para de abrir) e cancelar', async ({ page, browser }) => {
    const o = await orcamentoAceito(null);
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    const link = await enviarContrato(page, o.id, false);
    await page.getByRole('link', { name: 'Ver o contrato' }).click();

    await page.getByTestId('novo-link-contrato').click();
    await expect(page.getByTestId('link-novo')).toBeVisible();
    const novo = (await page
      .getByTestId('link-novo')
      .getByTestId('link-contrato')
      .getAttribute('href'))!;
    expect(novo).not.toBe(link);
    await expect(page.getByTestId('historico-contrato')).toContainText('gerou um link novo');

    const c = await cliente(browser);
    await c.goto(link);
    await expect(c.getByTestId('contrato-indisponivel')).toBeVisible();
    await c.goto(novo);
    await expect(c.getByRole('heading', { name: 'Leia e assine o seu contrato' })).toBeVisible();

    await page.getByTestId('cancelar-contrato').click();
    await page.getByLabel('Motivo (opcional, só o buffet vê)').fill('Cliente desistiu');
    await page.getByTestId('confirmar-cancelar-contrato').click();
    await expect(page.getByTestId('selo-contrato').first()).toHaveText('Cancelado');
    await expect(page.getByTestId('historico-contrato')).toContainText(
      'cancelou: Cliente desistiu',
    );
    await c.reload();
    await expect(c.getByTestId('contrato-indisponivel')).toBeVisible();
  });

  test('modelos: cópia do modelo do Orkestra, erro de variável e salvar', async ({ page }) => {
    const titulo = `Modelo E2E ${Date.now()}`;
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    await page.goto('/app/contratos/modelos');
    await page.getByTestId('copiar-modelo-infantil').click();
    await expect(page.getByRole('heading', { name: 'Novo modelo (cópia)' })).toBeVisible();
    await page.getByTestId('modelo-titulo').fill(titulo);
    const texto = page.getByTestId('modelo-texto');
    await texto.fill(`${await texto.inputValue()}\n\nObservação: {{variavel_que_nao_existe}}`);
    await expect(page.getByTestId('erros-modelo')).toContainText('Variável desconhecida');
    await expect(page.getByTestId('salvar-modelo')).toBeDisabled();
    await texto.fill(
      (await texto.inputValue()).replace('{{variavel_que_nao_existe}}', 'conferir no dia.'),
    );
    await page.getByTestId('salvar-modelo').click();
    await expect(page).toHaveURL(/\/app\/contratos\/modelos\/[0-9a-f-]{36}$/);
    await page.goto('/app/contratos/modelos');
    const meu = page
      .getByTestId('modelos-empresa')
      .getByRole('listitem')
      .filter({ hasText: titulo });
    await expect(meu).toBeVisible();
    // desliga para não mudar o modelo dos outros testes
    await meu.getByTestId('alternar-modelo').click();
    await expect(meu.getByTestId('alternar-modelo')).not.toBeChecked();
    await noBanco((sql) => sql`delete from public.contrato_modelos where titulo = ${titulo}`);
  });

  test('vendedor não vê Contratos; o dono vê o cartão em Números', async ({ page }) => {
    await entrar(page, 'vendedor@demo.local', SENHA_SEED);
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link', { name: 'Leads' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Contratos' })).toHaveCount(0);
    await page.goto('/app/numeros');
    await expect(page.getByTestId('numeros-contratos')).toHaveCount(0);
  });
});

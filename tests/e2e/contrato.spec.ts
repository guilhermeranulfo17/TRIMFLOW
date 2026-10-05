import { expect, test, type Browser, type Page } from '@playwright/test';
import { noBanco } from './banco';
import { entrar, semRolagemHorizontal, SENHA_SEED } from './helpers';

/*
 * Etapa 10 (PR 1): o dono gera o contrato a partir do orçamento aceito e envia (já assinado
 * por ele); o cliente, em outro navegador no celular, lê, assina e baixa o PDF. Com e sem o
 * código por e-mail (API falsa do Resend), pedido de ajuste e link inválido.
 */

const CPF = '529.982.247-25';
const API_FALSA = 'http://localhost:4010';

async function cliente(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    isMobile: true,
    hasTouch: true,
  });
  return ctx.newPage();
}

/** Um orçamento aceito do Buffet Demo, com nome e e-mail do cliente conhecidos. */
async function orcamentoAceito(email: string | null): Promise<{ id: string; nome: string }> {
  return noBanco(async (sql) => {
    const [o] = await sql<{ id: string; lead_id: string }[]>`
      select o.id, o.lead_id from public.orcamentos o
      join public.leads l on l.id = o.lead_id
      join public.empresas e on e.id = o.empresa_id
      where e.slug = 'buffet-demo' and o.status = 'aceito' and not l.eh_teste
        and l.anonimizado_em is null
      order by o.criado_em limit 1`;
    await sql`update public.leads set email = ${email} where id = ${o!.lead_id}`;
    const [l] = await sql<
      { nome: string }[]
    >`select nome from public.leads where id = ${o!.lead_id}`;
    return { id: o!.id, nome: l!.nome };
  });
}

/** Dono gera e envia; devolve o link do cliente. */
async function enviarContrato(page: Page, orcamentoId: string, exigirCodigo: boolean) {
  await page.goto(`/app/contratos/novo?orcamento=${orcamentoId}`);
  await expect(page.getByTestId('aviso-modelo')).toContainText('advogado');
  await expect(page.getByTestId('previa-contrato')).toContainText('CONTRATANTE');
  // completa o que o orçamento não trouxe (ex.: CNPJ, endereço do buffet)
  for (const campo of await page.locator('[data-variavel]').all()) {
    if (!(await campo.inputValue())) await campo.fill('Informação de teste');
  }
  const codigo = page.getByRole('checkbox', { name: /Exigir código por e-mail/ });
  if ((await codigo.isEnabled()) && (await codigo.isChecked()) !== exigirCodigo) {
    await codigo.click();
  }
  await page.getByTestId('enviar-contrato').click();
  await expect(page.getByTestId('contrato-enviado')).toBeVisible();
  return (await page.getByTestId('link-contrato').getAttribute('href'))!;
}

async function preencherAssinatura(c: Page, nome: string) {
  await c.getByLabel('Nome completo').fill(nome);
  await c.getByLabel('CPF').fill(CPF);
  await expect(c.getByLabel('CPF')).toHaveValue(CPF);
  await c.getByLabel('Li e concordo com este contrato.').check();
}

test.describe('contrato digital', () => {
  test.describe.configure({ mode: 'serial' });

  test('dono envia, cliente assina pelo celular e baixa o PDF com comprovante', async ({
    page,
    browser,
  }) => {
    const o = await orcamentoAceito(null);
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    const link = await enviarContrato(page, o.id, false);
    expect(link).toMatch(/\/b\/buffet-demo\/contrato\/[A-Za-z0-9_-]{43}$/);

    const c = await cliente(browser);
    await c.goto(link);
    await expect(c.getByRole('heading', { name: 'Leia e assine o seu contrato' })).toBeVisible();
    await expect(c.getByTestId('resumo-contrato')).toContainText('Valor total');
    await expect(c.getByTestId('texto-contrato')).toContainText('Assinatura eletrônica');
    expect(await semRolagemHorizontal(c)).toBe(true);
    // a página não vai para buscadores
    await expect(c.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    // erros simples antes de assinar
    await c.getByTestId('assinar-contrato').click();
    await expect(c.getByText('Escreva o nome completo (nome e sobrenome).')).toBeVisible();
    await preencherAssinatura(c, 'Cliente Assinante Teste');
    await c.getByTestId('assinar-contrato').click();
    await expect(c.getByTestId('contrato-concluido')).toBeVisible();
    await expect(c.getByRole('heading', { name: 'Contrato assinado' })).toBeVisible();

    const pdf = await c.request.get(`${link}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect(pdf.headers()['x-robots-tag']).toContain('noindex');
    const corpo = await pdf.body();
    expect(corpo.subarray(0, 5).toString()).toBe('%PDF-');
    expect(corpo.length).toBeGreaterThan(5_000);

    // no banco: concluído, CPF só cifrado e mascarado
    const [linha] = await noBanco(
      (sql) => sql<{ status: string; doc: string; masc: string }[]>`
        select c.status, a.documento_cifrado as doc, a.documento_mascarado as masc
        from public.contratos c join public.contrato_assinaturas a on a.contrato_id = c.id
        where a.parte = 'cliente' order by c.criado_em desc limit 1`,
    );
    expect(linha!.status).toBe('concluido');
    expect(linha!.masc).toBe('***.982.247-**');
    expect(linha!.doc).not.toContain('52998224725');

    // reabrir o link: só a mensagem de assinado e o PDF
    await c.reload();
    await expect(c.getByTestId('baixar-pdf-contrato')).toBeVisible();
    await expect(c.getByTestId('bloco-assinar')).toHaveCount(0);
  });

  test('com código por e-mail: errado é recusado, o certo assina', async ({ page, browser }) => {
    const email = `cliente-${Date.now()}@exemplo.com`;
    const o = await orcamentoAceito(email);
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    const link = await enviarContrato(page, o.id, true);

    const c = await cliente(browser);
    await c.goto(link);
    await expect(c.getByText(/c\*\*\*@exemplo\.com/).first()).toBeVisible();
    await c.getByTestId('enviar-codigo').click();
    await expect(c.getByText(/Enviamos um código/)).toBeVisible();
    const r = await c.request.get(`${API_FALSA}/resend/ultimo?para=${encodeURIComponent(email)}`);
    const recebido = (await r.json()) as { subject: string };
    const codigo = /^(\d{6})/.exec(recebido.subject)![1]!;
    const errado = codigo === '000000' ? '111111' : '000000';

    await preencherAssinatura(c, 'Cliente Com Codigo');
    await c.getByLabel('Código de 6 números').fill(errado);
    await c.getByTestId('assinar-contrato').click();
    await expect(c.getByTestId('erro-assinar')).toContainText('Código incorreto');
    await c.getByLabel('Código de 6 números').fill(codigo);
    await c.getByTestId('assinar-contrato').click();
    await expect(c.getByTestId('contrato-concluido')).toBeVisible();
  });

  test('pedir ajuste: o cliente recusa e o link mostra o pedido', async ({ page, browser }) => {
    const o = await orcamentoAceito(null);
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    const link = await enviarContrato(page, o.id, false);

    const c = await cliente(browser);
    await c.goto(link);
    await c.getByRole('button', { name: 'Não concordo / Pedir ajuste' }).click();
    await c.getByLabel('O que precisa mudar? (opcional)').fill('Trocar o horário');
    await c.getByTestId('confirmar-ajuste').click();
    await expect(c.getByTestId('contrato-recusado')).toBeVisible();
  });

  test('link inválido ou de outro buffet: mesma mensagem, sem dados', async ({ browser }) => {
    const c = await cliente(browser);
    await c.goto(`/b/buffet-demo/contrato/${'x'.repeat(43)}`);
    await expect(c.getByTestId('contrato-indisponivel')).toBeVisible();
    await c.goto('/b/buffet-demo/contrato/curto');
    await expect(c.getByTestId('contrato-indisponivel')).toBeVisible();
    const pdf = await c.request.get(`/b/buffet-demo/contrato/${'x'.repeat(43)}/pdf`);
    expect(pdf.status()).toBe(404);
  });
});

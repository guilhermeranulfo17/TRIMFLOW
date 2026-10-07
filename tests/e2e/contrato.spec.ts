import { expect, test } from '@playwright/test';
import { noBanco } from './banco';
import { entrar, semRolagemHorizontal, SENHA_SEED } from './helpers';

/*
 * Etapa 10 (PR 1): o dono gera o contrato a partir do orçamento aceito e envia (já assinado
 * por ele); o cliente, em outro navegador no celular, lê, assina e baixa o PDF. Com e sem o
 * código por e-mail (API falsa do Resend), pedido de ajuste e link inválido.
 */

import {
  API_FALSA,
  cliente,
  enviarContrato,
  orcamentoAceito,
  preencherAssinatura,
} from './contratos-apoio';

test.describe('contrato digital', () => {
  test.describe.configure({ mode: 'serial' });
  // todo o E2E sai do mesmo IP: zera só os limites do contrato (nenhum outro teste usa)
  test.beforeEach(() =>
    noBanco((sql) => sql`delete from publico.tentativas where acao like 'contrato%'`),
  );

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

import { expect, test, type Page } from '@playwright/test';
import { noBanco } from './banco';
import { entrar, SENHA_SEED } from './helpers';
import { vigiarCsp } from './csp';
import { codigoTotp } from './totp';

/*
 * Etapa 14 (Vendas Orkestra, §77), no celular: a área só existe para a equipe com MFA; dono de
 * buffet recebe 404. As abas levam às cinco telas.
 */

const ADMIN = { id: '0e000000-0000-4000-8000-000000000001', email: 'equipe@orkestra.local' };

/** Entra no /interno como a equipe, cadastrando o TOTP do zero. */
async function entrarComoEquipe(admin: Page) {
  await noBanco(async (sql) => {
    await sql`delete from auth.mfa_factors where user_id = ${ADMIN.id}`;
  });
  await admin.goto('/interno/vendas');
  await expect(admin).toHaveURL(/\/interno\/entrar$/);
  await admin.getByLabel('E-mail').fill(ADMIN.email);
  await admin.getByLabel('Senha').fill(SENHA_SEED);
  await admin.getByRole('button', { name: 'Entrar' }).click();
  await expect(admin).toHaveURL(/\/interno\/mfa$/);
  const segredo = (await admin.getByTestId('segredo-mfa').innerText()).trim();
  await admin.getByLabel(/Código de 6 números/).fill(codigoTotp(segredo));
  await admin.getByRole('button', { name: 'Confirmar' }).click();
  await expect(admin.getByTestId('interno')).toBeVisible();
}

test('Vendas Orkestra: só a equipe entra e as abas abrem cada tela', async ({ page, browser }) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  const resposta = await page.goto('/interno/vendas');
  expect(resposta?.status()).toBe(404);

  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const admin = await ctx.newPage();
  const violacoes = await vigiarCsp(admin);
  await entrarComoEquipe(admin);

  await admin.getByTestId('link-vendas').click();
  await expect(admin).toHaveURL(/\/interno\/vendas$/);
  await expect(admin.getByTestId('vendas-orkestra')).toContainText('Nada na fila hoje');

  const abas: [string, RegExp, string][] = [
    ['Pipeline', /\/interno\/vendas\/pipeline$/, 'Pipeline vazio'],
    ['Leads', /\/interno\/vendas\/leads$/, 'Nenhum lead ainda'],
    ['Conhecimento', /\/interno\/vendas\/conhecimento$/, 'Base de conhecimento vazia'],
    ['Exemplos', /\/interno\/vendas\/exemplos$/, 'Nenhum exemplo marcado'],
    ['Fila do dia', /\/interno\/vendas$/, 'Nada na fila hoje'],
  ];
  for (const [rotulo, url, texto] of abas) {
    await admin.getByTestId(`aba-vendas-${rotulo}`).click();
    await expect(admin).toHaveURL(url);
    await expect(admin.getByTestId(`aba-vendas-${rotulo}`)).toHaveAttribute('aria-current', 'page');
    await expect(admin.getByTestId('vendas-orkestra')).toContainText(texto);
  }
  expect(violacoes()).toEqual([]);
  await ctx.close();
});

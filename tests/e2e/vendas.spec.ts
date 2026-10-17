import { expect, test, type Page } from '@playwright/test';
import { noBanco } from './banco';
import { entrar, SENHA_SEED } from './helpers';
import { vigiarCsp } from './csp';
import { codigoTotp } from './totp';

/*
 * Etapa 14 (Vendas Orkestra, §77), no celular: a área só existe para a equipe com MFA; dono de
 * buffet recebe 404. As abas levam às cinco telas.
 */

// os testes recadastram o TOTP da mesma conta da equipe: um de cada vez
test.describe.configure({ mode: 'serial' });

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
    ['Leads', /\/interno\/vendas\/leads$/, 'Novo lead'],
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

test('Vendas Orkestra: cadastra, busca e edita lead; telefone repetido é recusado', async ({
  browser,
}) => {
  await noBanco(async (sql) => {
    await sql`delete from public.vendas_leads where telefone_e164 in ('+5534999990101', '+5534999990102')`;
  });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const admin = await ctx.newPage();
  const violacoes = await vigiarCsp(admin);
  await entrarComoEquipe(admin);

  // cadastra
  await admin.goto('/interno/vendas/leads');
  await admin.getByTestId('novo-lead').click();
  await admin.getByLabel('Nome').fill('Marta Teste E2E');
  await admin.getByLabel('Buffet', { exact: true }).fill('Buffet Sol E2E');
  await admin.getByLabel('Telefone (WhatsApp)').fill('34999990101');
  await admin.getByLabel('Cidade').fill('São José');
  await admin.getByLabel('Origem').fill('Instagram');
  await admin.getByRole('button', { name: 'Cadastrar lead' }).click();
  await expect(admin).toHaveURL(/\/interno\/vendas\/leads$/);
  const lista = admin.getByTestId('lista-leads-vendas');
  await expect(lista).toContainText('Marta Teste E2E');
  await expect(lista).toContainText('(34) 99999-0101');
  await expect(lista).toContainText('Novo');

  // busca sem acento
  await admin.getByLabel('Buscar lead').fill('sao jose');
  await admin.getByRole('button', { name: 'Buscar' }).click();
  await expect(lista).toContainText('Marta Teste E2E');

  // telefone repetido
  await admin.goto('/interno/vendas/leads/novo');
  await admin.getByLabel('Nome').fill('Outra Pessoa');
  await admin.getByLabel('Telefone (WhatsApp)').fill('34999990101');
  await admin.getByRole('button', { name: 'Cadastrar lead' }).click();
  await expect(admin.getByTestId('form-lead-vendas')).toContainText(
    'Já existe um lead com esse telefone.',
  );

  // edita: marca não contatar e follow-up
  await admin.goto('/interno/vendas/leads');
  await admin.getByText('Marta Teste E2E').click();
  await expect(admin.getByTestId('etapa-lead')).toContainText('Novo');
  await admin.getByLabel('Próximo follow-up').fill('2026-11-14');
  await admin.getByLabel(/Não contatar/).check();
  await admin.getByRole('button', { name: 'Salvar' }).click();
  await expect(admin.getByText('Lead salvo.')).toBeVisible();
  await admin.goto('/interno/vendas/leads');
  await expect(lista).toContainText('Follow-up 14/11/2026');
  await expect(lista).toContainText('Não contatar');

  // o cadastro manual registrou o movimento e a auditoria só com o id
  await noBanco(async (sql) => {
    const [m] = await sql`select m.para, m.origem, m.motivo from public.vendas_movimentos m
      join public.vendas_leads l on l.id = m.lead_id where l.telefone_e164 = '+5534999990101'`;
    expect(m).toMatchObject({ para: 'novo', origem: 'manual', motivo: 'Cadastro manual' });
    const [a] = await sql`select dados from public.auditoria_interna
      where acao = 'vendas.lead_editado' order by criado_em desc limit 1`;
    expect(Object.keys(a!.dados as object)).toEqual(['lead_id']);
  });
  expect(violacoes()).toEqual([]);
  await ctx.close();
});

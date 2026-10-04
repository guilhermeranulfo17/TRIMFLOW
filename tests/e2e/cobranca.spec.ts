import { expect, test } from '@playwright/test';
import { noBanco } from './banco';
import { cadastrar, emailUnico, entrar, SENHA_SEED } from './helpers';
import { vigiarCsp } from './csp';
import { codigoTotp } from './totp';

/*
 * Etapa 9A no celular (375x812), com a API falsa do Asaas (tests/support/asaas-fake*):
 *   1. o teste acaba (relógio simulado no banco) → faixa → painel somente leitura → assina o
 *      Profissional com o cupom de fundador → paga a fatura → webhook → conta ativa a R$ 97;
 *   2. /interno: fora da lista = 404; sem MFA não entra; com TOTP entra; suporte só com o
 *      consentimento do dono, com a faixa vermelha.
 */

const ADMIN = { id: '0e000000-0000-4000-8000-000000000001', email: 'equipe@orkestra.local' };
const TESTE_B = '22222222-2222-4222-8222-222222222222';

test('teste acaba, conta fica somente leitura, assina com o cupom de fundador e volta a ativa', async ({
  page,
}) => {
  const email = emailUnico('cobranca');
  await cadastrar(page, {
    nome: 'Dona Cobrança',
    email,
    whatsapp: '34991230000',
    senha: SENHA_SEED,
    buffet: `Buffet Cobrança ${Date.now()}`,
    segmento: 'Infantil',
  });
  await expect(page).toHaveURL(/\/app\/comecar/);

  // relógio simulado: o teste grátis venceu e o job de hora em hora rodou
  await noBanco(async (sql) => {
    await sql`update public.empresas set trial_ate = now() - interval '1 minute'
      where id = (select empresa_id from public.usuarios where email = ${email})`;
    await sql`select public.atualizar_situacoes()`;
  });

  await page.goto('/app/empresa/link');
  const faixa = page.getByTestId('faixa-conta');
  await expect(faixa).toHaveAttribute('data-tipo', 'suspenso');
  await expect(faixa).toContainText('somente leitura');

  // escrever é recusado com a mensagem e o atalho para o plano
  await page.getByRole('button', { name: 'Já coloquei o link na bio' }).click();
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('somente leitura');
  await expect(toast.getByRole('link', { name: 'Ver planos' })).toBeVisible();

  await faixa.click();
  await expect(page).toHaveURL(/\/app\/empresa\/plano$/);
  await expect(page.getByTestId('situacao-plano')).toContainText('Acesso suspenso');
  await page.getByTestId('plano-profissional').click();
  await page.getByLabel('Cupom (opcional)').fill('fundador');
  await page.getByLabel('Nome ou razão social').fill('Dona Cobrança');
  await page.getByLabel('CPF ou CNPJ').fill('52998224725');
  await expect(page.getByLabel('E-mail para a fatura')).toHaveValue(email);
  await page.getByTestId('botao-assinar').click();

  // página de fatura do Asaas (falsa): paga por Pix
  await expect(page).toHaveURL(/localhost:4010\/fatura\//);
  await expect(page.getByText('Valor: R$ 97,00')).toBeVisible();
  await page.getByTestId('pagar-pix').click();

  await expect(page).toHaveURL(/\/app\/empresa\/plano\?pagamento=ok$/);
  const situacao = page.getByTestId('situacao-plano');
  await expect(situacao).toContainText('Assinatura ativa');
  await expect(situacao).toContainText('R$ 97,00');
  await expect(situacao).toContainText('FUNDADOR');
  await expect(page.getByTestId('faixa-conta')).toHaveCount(0);
  await expect(page.getByTestId('lista-faturas')).toContainText('Paga');

  // escrever volta a funcionar
  await page.goto('/app/empresa/link');
  await page.getByRole('button', { name: 'Já coloquei o link na bio' }).click();
  await expect(page.getByRole('button', { name: 'Link na bio: feito' })).toBeVisible();
});

test('/interno exige a lista e o MFA; o suporte só entra com o consentimento do dono', async ({
  page,
  browser,
}) => {
  await noBanco(async (sql) => {
    await sql`delete from auth.mfa_factors where user_id = ${ADMIN.id}`;
    await sql`delete from public.acessos_suporte where empresa_id = ${TESTE_B}`;
  });

  // dono de buffet não vê o /interno
  await entrar(page, 'dono@testeb.local', SENHA_SEED);
  const resposta = await page.goto('/interno');
  expect(resposta?.status()).toBe(404);

  // equipe: login → sem MFA não entra → cadastra o TOTP → entra
  const ctxAdmin = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const admin = await ctxAdmin.newPage();
  // Etapa 9B: o /interno (login, MFA, empresa, modo suporte) também sem violação de CSP
  const violacoes = await vigiarCsp(admin);
  await admin.goto('/interno');
  await expect(admin).toHaveURL(/\/interno\/entrar$/);
  await admin.getByLabel('E-mail').fill(ADMIN.email);
  await admin.getByLabel('Senha').fill(SENHA_SEED);
  await admin.getByRole('button', { name: 'Entrar' }).click();
  await expect(admin).toHaveURL(/\/interno\/mfa$/);
  const segredo = (await admin.getByTestId('segredo-mfa').innerText()).trim();
  await admin.goto('/interno');
  await expect(admin).toHaveURL(/\/interno\/mfa$/);
  await expect(admin.getByTestId('segredo-mfa')).toBeVisible();
  const segredoNovo = (await admin.getByTestId('segredo-mfa').innerText()).trim();
  await admin.getByLabel(/Código de 6 números/).fill(codigoTotp(segredoNovo || segredo));
  await admin.getByRole('button', { name: 'Confirmar' }).click();
  await expect(admin.getByTestId('interno')).toBeVisible();

  // sem consentimento, não há botão
  await admin.goto(`/interno/empresas/${TESTE_B}`);
  await expect(admin.getByTestId('empresa-interna')).toContainText('Buffet Teste B');
  await expect(admin.getByTestId('entrar-como-empresa')).toHaveCount(0);

  // o dono libera por 7 dias
  await page.goto('/app/empresa/plano');
  await page.getByTestId('permitir-suporte').click();
  await expect(page.getByTestId('acesso-suporte')).toContainText('O suporte pode acessar até');

  // a equipe entra como a empresa, com a faixa vermelha, e sai
  await admin.reload();
  await admin.getByTestId('entrar-como-empresa').click();
  await expect(admin).toHaveURL(/\/app\/leads$/);
  await expect(admin.getByTestId('faixa-suporte')).toContainText(
    'Suporte Orkestra acessando a conta de Buffet Teste B',
  );
  await admin.getByRole('button', { name: 'Sair do modo suporte' }).click();
  await expect(admin).toHaveURL(new RegExp(`/interno/empresas/${TESTE_B}$`));
  await expect(admin.getByTestId('empresa-interna')).toContainText('suporte.saiu');
  expect(violacoes()).toEqual([]);

  // o dono revoga: o botão some
  await page.reload();
  await page.getByRole('button', { name: 'Remover acesso do suporte' }).click();
  await expect(page.getByTestId('permitir-suporte')).toBeVisible();
  await admin.reload();
  await expect(admin.getByTestId('entrar-como-empresa')).toHaveCount(0);

  const acoes = await noBanco(
    (sql) => sql`select acao from public.auditoria where empresa_id = ${TESTE_B}
      and acao like 'suporte.%' order by criado_em`,
  );
  expect(acoes.map((a) => a.acao)).toEqual([
    'suporte.permitido',
    'suporte.entrou',
    'suporte.revogado',
  ]);
  await ctxAdmin.close();
});

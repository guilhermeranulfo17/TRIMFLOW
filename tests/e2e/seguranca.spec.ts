import { expect, test } from '@playwright/test';
import { noBanco } from './banco';
import { vigiarCsp } from './csp';
import { cadastrar, emailUnico, entrar, SENHA_SEED } from './helpers';
import { codigoTotp } from './totp';

/*
 * Etapa 9B · B.2 Segurança e B.1 LGPD nas telas:
 *   - cabeçalhos de segurança em todas as rotas;
 *   - percurso (landing, login com e-mail e Google, cadastro, painel, vitrine, orçamento,
 *     proposta, termos, /interno) sem nenhuma violação de CSP (o /interno com MFA é percorrido
 *     no teste de cobrança, com o mesmo coletor);
 *   - limite de tentativas no login;
 *   - aceite versionado dos termos bloqueia o painel até aceitar;
 *   - LGPD: exportar e apagar o lead, exportar a empresa, pedir e desistir da exclusão.
 */

const ROTAS = [
  '/',
  '/login',
  '/cadastro',
  '/recuperar-senha',
  '/termos',
  '/privacidade',
  '/subprocessadores',
  '/b/buffet-demo',
  '/b/buffet-demo/orcamento',
  '/interno/entrar',
  '/api/saude',
];

test('cabeçalhos de segurança em todas as rotas; nonce nas páginas dinâmicas', async ({
  request,
}) => {
  for (const rota of ROTAS) {
    const r = await request.get(rota, { maxRedirects: 0 });
    const h = r.headers();
    expect(h['content-security-policy'], rota).toBeTruthy();
    expect(h['x-content-type-options'], rota).toBe('nosniff');
    expect(h['referrer-policy'], rota).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy'], rota).toContain('camera=()');
    expect(h['x-frame-options'], rota).toBe(rota === '/b/buffet-demo' ? 'SAMEORIGIN' : 'DENY');
    expect(h['x-request-id'], rota).toBeTruthy();
  }
  const login = await request.get('/login');
  const csp = login.headers()['content-security-policy']!;
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).toContain("frame-ancestors 'none'");
  expect(await login.text()).toContain(`nonce="${nonce}"`);
  // sem unsafe-inline nas páginas dinâmicas
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
});

test('percurso inteiro sem violação de CSP', async ({ page }) => {
  test.setTimeout(120_000);
  const violacoes = await vigiarCsp(page);
  const [proposta] = await noBanco(
    (sql) => sql<{ token: string }[]>`select o.token from public.orcamentos o
      join public.empresas e on e.id = o.empresa_id
      where e.slug = 'buffet-demo' and o.status in ('enviado', 'visualizado') limit 1`,
  );

  // visitante
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/termos');
  await page.goto('/b/buffet-demo');
  await expect(page.locator('#nome-buffet')).toBeVisible();
  await page.goto('/b/buffet-demo/orcamento');
  await expect(page.getByRole('main')).toBeVisible();
  await page.goto(`/b/buffet-demo/proposta/${proposta!.token}`);
  await expect(page.getByRole('main')).toBeVisible();
  await page.goto('/cadastro');
  await expect(page.getByRole('button', { name: 'Criar conta' })).toBeEnabled();
  await page.goto('/interno/entrar');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

  // login com o Google (a ida ao Google é interceptada) e com e-mail
  await page.route('**/auth/v1/authorize**', (rota) =>
    rota.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google</p>' }),
  );
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continuar com o Google' }).click();
  await page.waitForURL(/\/auth\/v1\/authorize/);
  await entrar(page, 'dono@demo.local', SENHA_SEED);

  // painel
  for (const rota of [
    '/app/leads',
    '/app/tarefas',
    '/app/agenda',
    '/app/numeros',
    '/app/avisos',
    '/app/orcamentos/novo',
    '/app/empresa',
    '/app/empresa/catalogo',
    '/app/empresa/link',
    '/app/empresa/plano',
    '/app/empresa/privacidade',
    '/app/conta/avisos',
  ]) {
    await page.goto(rota);
    await expect(page.getByRole('main').first()).toBeVisible();
  }
  await page.goto('/app/leads');
  await page.getByTestId('card-lead').first().getByRole('link').first().click();
  await expect(page.getByTestId('detalhe-lead')).toBeVisible();

  expect(violacoes()).toEqual([]);
});

test('limite de tentativas no login (por e-mail, a partir do mesmo IP)', async ({ page }) => {
  // IP público de documentação (RFC 5737): o IP local do CI não entra no limite
  await page.setExtraHTTPHeaders({
    'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
  });
  const email = emailUnico('limite');
  await page.goto('/login');
  for (let i = 0; i < 10; i++) {
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('senha-errada-1');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByTestId('aviso-form')).toContainText('E-mail ou senha incorretos');
  }
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('aviso-form')).toContainText('Muitas tentativas');
});

test('termos novos: o painel pede o aceite antes de qualquer tela', async ({ page }) => {
  const email = emailUnico('aceite');
  await cadastrar(page, {
    nome: 'Dona Aceite',
    email,
    whatsapp: '34991355450',
    senha: SENHA_SEED,
    buffet: 'Buffet Aceite',
    segmento: 'Buffet infantil',
  });
  await expect(page).toHaveURL(/\/app\/comecar$/);
  // o cadastro gravou o aceite; agora a versão muda
  await noBanco(
    (sql) => sql`update public.usuarios set termos_versao = '2000-01-01' where email = ${email}`,
  );
  await page.goto('/app/leads');
  await expect(page).toHaveURL(/\/app\/aceite$/);
  await expect(page.getByRole('heading', { name: 'Atualizamos nossos termos' })).toBeVisible();
  await page.goto('/app/comecar');
  await expect(page).toHaveURL(/\/app\/aceite$/);
  await page.getByRole('button', { name: 'Aceitar e continuar' }).click();
  await expect(page.getByTestId('aviso-form')).toContainText('marque que leu');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aceitar e continuar' }).click();
  await expect(page).toHaveURL(/\/app\/leads$/);
  const [u] = await noBanco(
    (sql) => sql`select termos_versao from public.usuarios where email = ${email}`,
  );
  expect(u!.termos_versao).not.toBe('2000-01-01');
});

test('LGPD: exportar e apagar os dados de um lead a pedido do titular', async ({ page }) => {
  const nome = `Titular ${Date.now()}`;
  const [lead] = await noBanco(
    (sql) => sql<
      { id: string }[]
    >`insert into public.leads (empresa_id, nome, whatsapp_e164, origem)
      select id, ${nome}, ${`+55349${String(Date.now()).slice(-8)}`}, 'instagram'
      from public.empresas where slug = 'buffet-demo' returning id`,
  );
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  await page.goto(`/app/leads/${lead!.id}`);
  const privacidade = page.getByTestId('privacidade-lead');
  await expect(privacidade).toBeVisible();

  const [json] = await Promise.all([
    page.waitForEvent('download'),
    privacidade.getByRole('link', { name: 'Exportar dados (JSON)' }).click(),
  ]);
  expect(json.suggestedFilename()).toMatch(/^lead-.*\.json$/);
  const conteudo = JSON.parse(
    await (await json.createReadStream()).toArray().then((p) => Buffer.concat(p).toString()),
  );
  expect(conteudo.lead.nome).toBe(nome);

  await privacidade.getByRole('button', { name: 'Apagar a pedido do titular' }).click();
  await page.getByLabel('Para confirmar, digite APAGAR').fill('apagar');
  await page.getByRole('button', { name: 'Apagar dados' }).click();
  await expect(page.getByTestId('lead-anonimizado')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Titular removido');
});

test('LGPD: exportar tudo, pedir a exclusão da conta e desistir', async ({ page }) => {
  const email = emailUnico('exclusao');
  await cadastrar(page, {
    nome: 'Dona Exclusao',
    email,
    whatsapp: '34991355450',
    senha: SENHA_SEED,
    buffet: 'Buffet Exclusao',
    segmento: 'Buffet infantil',
  });
  await expect(page).toHaveURL(/\/app\/comecar$/);
  await page.goto('/app/empresa/privacidade');

  const [zip] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('exportar-empresa').click(),
  ]);
  expect(zip.suggestedFilename()).toMatch(/^orkestra-buffet-exclusao.*\.zip$/);

  await page.getByLabel('Apagar os dados depois de').selectOption('12');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Prazo de guarda' })).toBeVisible();

  await page.getByLabel('Para confirmar, digite EXCLUIR').fill('EXCLUIR');
  await page.getByRole('button', { name: 'Excluir a conta' }).click();
  await expect(page.getByTestId('exclusao-agendada')).toBeVisible();
  await expect(page.getByTestId('faixa-exclusao')).toBeVisible();
  await page.getByRole('button', { name: 'Desistir da exclusão' }).click();
  await expect(page.getByTestId('faixa-exclusao')).toHaveCount(0);
  await expect(page.getByLabel('Para confirmar, digite EXCLUIR')).toBeVisible();
});

test('MFA opcional do dono: liga, o login pede o código, desliga', async ({ page }) => {
  const email = emailUnico('mfa');
  await cadastrar(page, {
    nome: 'Dona Mfa',
    email,
    whatsapp: '34991355450',
    senha: SENHA_SEED,
    buffet: 'Buffet Mfa',
    segmento: 'Buffet infantil',
  });
  await expect(page).toHaveURL(/\/app\/comecar$/);
  await page.goto('/app/conta/seguranca');
  await expect(page.getByTestId('estado-mfa')).toHaveText('Desligada');
  await page.getByRole('button', { name: 'Ligar a verificação em duas etapas' }).click();
  const segredo = (await page.getByTestId('segredo-mfa').innerText()).trim();
  await page.getByLabel(/Código de 6 números/).fill(codigoTotp(segredo));
  await page.getByRole('button', { name: 'Confirmar e ligar' }).click();
  await expect(page.getByTestId('estado-mfa')).toHaveText('Ligada');

  // nova sessão: senha certa não basta
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_SEED);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/login\/verificacao/);
  // sem o código, o painel manda de volta para a verificação
  await page.goto('/app/agenda');
  await expect(page).toHaveURL(/\/login\/verificacao\?next=%2Fapp%2Fagenda$/);
  await page.getByLabel(/Código de 6 números/).fill('000000');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('aviso-form')).toContainText('Código incorreto');
  await page.getByLabel(/Código de 6 números/).fill(codigoTotp(segredo));
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/agenda$/);

  // desligar exige um código atual
  await page.goto('/app/conta/seguranca');
  await page.getByLabel(/Código de 6 números/).fill(codigoTotp(segredo));
  await page.getByRole('button', { name: 'Desligar' }).click();
  await expect(page.getByTestId('estado-mfa')).toHaveText('Desligada');
});

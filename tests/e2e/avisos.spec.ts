import { expect, test, type Browser, type Page } from '@playwright/test';
import { noBanco, zerarLimites } from './banco';
import { cadastrar, emailUnico, entrar, semRolagemHorizontal, SENHA_SEED } from './helpers';

/*
 * Etapa 7: avisos e follow-up automático, no celular (375x812).
 * Os jobs (gerar_tarefas_automaticas) são chamados direto no banco local; o processador da
 * fila roda pelo after() das ações. Testes que mudam preferências ou regras usam uma empresa
 * nova, para não mexer no Buffet Demo que os outros testes (em paralelo) usam.
 */

const SLUG = 'buffet-demo';

function whatsappNovo(): string {
  const n = String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-8);
  return `349${n}`;
}

const unico = (nome: string) => `${nome} ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

async function toast(page: Page, texto: string | RegExp) {
  await expect(page.getByTestId('toast').filter({ hasText: texto })).toBeVisible();
}

async function visitante(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  return ctx.newPage();
}

/** Empresa nova com o catálogo de exemplo (Salão principal; Almoço, Tarde e Noite). */
async function empresaComModelo(page: Page, buffet: string) {
  await cadastrar(page, {
    nome: 'Dona Avisos',
    email: emailUnico('avisos'),
    whatsapp: '34991355450',
    senha: 'senha-forte-123',
    buffet,
    segmento: 'Buffet infantil',
  });
  await expect(page).toHaveURL(/\/app\/leads$/);
  await page.goto('/app/empresa/catalogo');
  await page.getByRole('button', { name: 'Carregar modelo de exemplo' }).click();
  await expect(page.getByTestId('card-pacote').first()).toBeVisible();
}

/** Orçamento interno salvo (lead "Em andamento" com proposta). */
async function orcamentoInterno(
  page: Page,
  o: { whatsapp: string; nome: string; mesesAFrente: number },
) {
  await page.goto('/app/orcamentos/novo');
  await page.getByLabel('WhatsApp do cliente').fill(o.whatsapp);
  await page.getByLabel('Nome do cliente').fill(o.nome);
  await page.getByRole('radio', { name: 'Aniversário infantil' }).click();
  for (let i = 0; i < o.mesesAFrente; i++) {
    await page.getByRole('button', { name: 'Próximo mês' }).click();
  }
  await page.locator('[aria-label^="sábado"][aria-label$="com horário livre"]').first().click();
  await page.getByTestId('turno').filter({ hasText: 'começa às' }).first().click();
  await page.locator('#adultos').fill('40');
  await page.getByTestId('opcao-pacote').first().click();
  await expect(page.getByTestId('total-interno')).toContainText('R$');
  await page.getByRole('button', { name: 'Salvar orçamento' }).click();
  await expect(page.getByTestId('saidas-orcamento')).toBeVisible();
}

/**
 * Simula o tempo: a proposta foi enviada há 30 h e o vendedor não falou mais com o cliente.
 * Depois roda o job das tarefas automáticas. Devolve o id do lead.
 */
async function propostaSemRespostaHa30h(nome: string): Promise<string> {
  return noBanco(async (sql) => {
    const [l] = await sql<{ id: string }[]>`select id from public.leads where nome = ${nome}`;
    await sql`update public.orcamentos
      set status = 'enviado', enviado_em = now() - interval '30 hours'
      where lead_id = ${l!.id} and status not in ('substituido', 'em_montagem')`;
    await sql`update public.leads set ultima_acao_vendedor_em = now() - interval '31 hours'
      where id = ${l!.id}`;
    return l!.id;
  });
}

const gerarTarefas = () =>
  noBanco((sql) => sql`select public.gerar_tarefas_automaticas()`.then(() => undefined));

const tarefasAutomaticas = (leadId: string) =>
  noBanco(
    (sql) => sql<{ regra: string; cancelada: boolean }[]>`
      select regra, cancelada_em is not null as cancelada from public.tarefas
      where lead_id = ${leadId} and origem = 'regra'`,
  );

/** Contador do sino (0 sem o selo). Força a consulta disparando o "voltar para a aba". */
async function contadorDoSino(page: Page): Promise<number> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const selo = page.getByTestId('contador-avisos');
  if (!(await selo.isVisible())) return 0;
  const t = (await selo.innerText()).trim();
  return t === '99+' ? 100 : Number(t);
}

test.beforeEach(async () => {
  await zerarLimites();
});

test('cliente pede pré-reserva pelo link; o sino do dono sobe e o aviso abre o lead', async ({
  page,
  browser,
}) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  await expect(page.getByTestId('sino')).toBeVisible();
  const antes = await contadorDoSino(page);

  // Cliente, em outro navegador, monta o orçamento e pré-reserva (mês longe dos outros testes).
  const nome = unico('Priscila Aviso');
  const cliente = await visitante(browser);
  await cliente.goto(`/b/${SLUG}/orcamento`);
  const tipo = cliente.getByRole('radio', { name: 'Aniversário infantil' });
  await expect(async () => {
    await tipo.click();
    await expect(tipo).toHaveAttribute('aria-checked', 'true', { timeout: 1_000 });
  }).toPass();
  await cliente.getByRole('button', { name: 'Continuar' }).click();
  await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 2 de 6/);
  // meses 19 a 24 (o calendário vai até 24): nenhum outro teste do Buffet Demo reserva lá
  const meses = 19 + Math.floor(Math.random() * 6);
  for (let i = 0; i < meses; i++) {
    await cliente.getByRole('button', { name: 'Próximo mês' }).click();
  }
  const livres = cliente.locator('[data-testid^="data-"]:not([disabled])');
  await livres.nth(Math.floor(Math.random() * 15)).click();
  await cliente.locator('[data-testid="turno"]:not([disabled])').first().click();
  await cliente.getByRole('spinbutton', { name: 'Adultos' }).fill('40');
  await expect(cliente.getByTestId('motivo')).toHaveText('');
  await expect(cliente.getByTestId('preco-resumo')).toContainText('R$');
  await expect(async () => {
    await cliente.getByRole('button', { name: 'Continuar' }).click();
    await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 3 de 6/, { timeout: 2_000 });
  }).toPass();
  await cliente.getByLabel('Seu nome').fill(nome);
  await cliente.getByLabel('Seu WhatsApp').fill(whatsappNovo());
  await cliente.getByRole('checkbox').check();
  await cliente.waitForTimeout(2_600); // tempo mínimo de preenchimento (anti-robô)
  await cliente.getByRole('button', { name: 'Ver pacotes e valores' }).click();
  await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 4 de 6/);
  await cliente.getByTestId('opcao-pacote').first().click();
  await cliente.getByRole('button', { name: 'Continuar' }).click();
  await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 5 de 6/);
  await cliente.getByRole('button', { name: 'Ver minha proposta' }).click();
  await expect(cliente).toHaveURL(/\/proposta\/[A-Za-z0-9_-]{32,}$/);
  await cliente.getByRole('button', { name: 'Quero reservar esta data' }).click();
  await expect(cliente.getByTestId('pre-reserva-ok')).toContainText('Data pré-reservada!');
  await cliente.context().close();

  // Dono (outra aba, sem recarregar): o contador sobe sozinho.
  await expect(async () => {
    expect(await contadorDoSino(page)).toBeGreaterThan(antes);
  }).toPass({ timeout: 30_000 });

  await page.getByTestId('sino').click();
  const item = page.getByTestId('item-aviso').filter({ hasText: nome });
  await expect(item).toContainText('Pré-reserva');
  await expect(item.getByLabel('Não lido')).toBeVisible();
  expect(await semRolagemHorizontal(page)).toBe(true);
  await item.click();
  await expect(page).toHaveURL(/\/app\/leads\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(nome);
  await expect(page.getByTestId('linha-do-tempo')).toContainText('Pediu pré-reserva');

  // O aviso ficou lido.
  await page.goto('/app/avisos');
  const noHistorico = page.getByTestId('item-aviso').filter({ hasText: nome });
  await expect(noHistorico).toBeVisible();
  await expect(noHistorico.getByLabel('Não lido')).toHaveCount(0);
});

test('Minha conta: ativar push neste aparelho, mudar o silêncio e enviar aviso de teste', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['notifications']);
  // O Chromium do teste não fala com o serviço de push do Google: a inscrição é simulada
  // (o service worker de verdade é registrado).
  const endpoint = `https://push.exemplo.test/e2e/${Math.random().toString(36).slice(2)}`;
  await context.addInitScript((ep) => {
    // guarda a inscrição no localStorage para sobreviver ao recarregar, como no navegador real
    const CHAVE = 'e2e-push';
    const fazer = () => ({
      endpoint: ep,
      toJSON: () => ({
        endpoint: ep,
        keys: {
          p256dh:
            'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
          auth: 'tBHItJI5svbpez7KI4CCXg',
        },
      }),
      unsubscribe: async () => {
        localStorage.removeItem(CHAVE);
        return true;
      },
    });
    PushManager.prototype.getSubscription = async () =>
      (localStorage.getItem(CHAVE) ? fazer() : null) as PushSubscription | null;
    PushManager.prototype.subscribe = async () => {
      localStorage.setItem(CHAVE, '1');
      return fazer() as unknown as PushSubscription;
    };
  }, endpoint);

  await empresaComModelo(page, unico('Buffet Push'));
  await page.getByRole('button', { name: /Menu do usuário/ }).click();
  await page.getByRole('menuitem', { name: /Minha conta: avisos/ }).click();
  await expect(page).toHaveURL(/\/app\/conta\/avisos$/);
  expect(await semRolagemHorizontal(page)).toBe(true);

  const aparelho = page.getByTestId('push-aparelho');
  await expect(aparelho).toHaveAttribute('data-estado', 'inativo');
  await page.getByRole('button', { name: 'Ativar neste aparelho' }).click();
  await toast(page, 'Avisos ligados neste aparelho.');
  await expect(aparelho).toHaveAttribute('data-estado', 'ativo');
  await expect(page.getByTestId('push-ativo')).toBeVisible();
  const registrado = await page.evaluate(async () =>
    Boolean(await navigator.serviceWorker.getRegistration('/')),
  );
  expect(registrado).toBe(true);

  // Silêncio: 21:30 às 06:45, persiste depois de recarregar.
  await page.getByLabel('Início do silêncio').fill('21:30');
  await page.getByLabel('Fim do silêncio').fill('06:45');
  await page.getByRole('button', { name: 'Salvar preferências' }).click();
  await toast(page, 'Preferências salvas.');
  await page.reload();
  await expect(page.getByLabel('Início do silêncio')).toHaveValue('21:30');
  await expect(page.getByLabel('Fim do silêncio')).toHaveValue('06:45');
  await expect(page.getByTestId('push-aparelho')).toHaveAttribute('data-estado', 'ativo');

  // Aviso de teste: sai no painel na hora; o celular tem um aparelho para tentar.
  await page.getByRole('button', { name: 'Enviar aviso de teste' }).click();
  const resultado = page.getByTestId('resultado-teste');
  await expect(resultado.locator('[data-canal="painel"]')).toContainText('Enviado');
  await expect(resultado.locator('[data-canal="push"]')).toBeVisible();
  await expect(resultado.locator('[data-canal="push"]')).not.toContainText(
    'Nenhum aparelho ativado',
  );
  await expect(resultado.locator('[data-canal="whatsapp"]')).toContainText(
    'Desligado nas suas preferências',
  );
  await expect(async () => {
    expect(await contadorDoSino(page)).toBeGreaterThan(0);
  }).toPass();
  await page.getByTestId('sino').click();
  await expect(page.getByTestId('item-aviso').filter({ hasText: 'Aviso de teste' })).toBeVisible();
});

test('dono desliga uma regra de follow-up e ela para de criar tarefas', async ({ page }) => {
  await empresaComModelo(page, unico('Buffet Regras'));
  await page.goto('/app/empresa/follow-up');
  expect(await semRolagemHorizontal(page)).toBe(true);
  const regra = page.getByTestId('regra-sem_resposta_24h');
  const chave = regra.getByRole('switch');
  await expect(chave).toBeChecked();
  await chave.click({ force: true });
  await toast(page, 'Regra desligada.');
  await page.reload();
  await expect(page.getByTestId('regra-sem_resposta_24h').getByRole('switch')).not.toBeChecked();

  // Proposta enviada há 30 h sem resposta: com a regra desligada, nenhuma tarefa nasce.
  const nome = unico('Rafaela Regra');
  await orcamentoInterno(page, { whatsapp: whatsappNovo(), nome, mesesAFrente: 2 });
  const leadId = await propostaSemRespostaHa30h(nome);
  await gerarTarefas();
  expect(await tarefasAutomaticas(leadId)).toEqual([]);

  // Liga de novo: o próximo job cria a tarefa (uma só, mesmo rodando duas vezes).
  await page.goto('/app/empresa/follow-up');
  await page.getByTestId('regra-sem_resposta_24h').getByRole('switch').click({ force: true });
  await toast(page, 'Regra salva.');
  await gerarTarefas();
  await gerarTarefas();
  expect(await tarefasAutomaticas(leadId)).toEqual([
    { regra: 'sem_resposta_24h', cancelada: false },
  ]);
});

test('tarefa automática aparece com o selo e some quando o vendedor registra contato', async ({
  page,
}) => {
  await entrar(page, 'vendedor@demo.local', SENHA_SEED);
  const nome = unico('Tereza Automática');
  // salvar o orçamento não ocupa a data: qualquer mês serve
  await orcamentoInterno(page, { whatsapp: whatsappNovo(), nome, mesesAFrente: 3 });
  const leadId = await propostaSemRespostaHa30h(nome);
  await gerarTarefas();

  await page.goto(`/app/leads/${leadId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(nome);
  const tarefa = page
    .getByTestId('tarefas-lead')
    .getByTestId('tarefa')
    .filter({
      has: page.getByTestId('selo-automatica'),
    });
  await expect(tarefa).toHaveCount(1);
  await expect(tarefa.getByTestId('selo-automatica')).toContainText('Automática');
  await expect(tarefa).toContainText(nome.split(' ')[0]!);
  await expect(page.getByTestId('linha-do-tempo')).toContainText('Tarefa automática');

  await page.goto('/app/tarefas');
  const naTela = page.getByTestId('tarefa').filter({ hasText: nome });
  await expect(naTela.getByTestId('selo-automatica')).toBeVisible();
  expect(await semRolagemHorizontal(page)).toBe(true);

  // O vendedor fala com o cliente: a situação mudou e a tarefa automática é cancelada.
  await page.goto(`/app/leads/${leadId}`);
  await page.getByTestId('barra-acoes').getByRole('button', { name: 'Registrar contato' }).click();
  const folha = page.getByRole('dialog');
  await folha.getByLabel('Resumo da conversa (opcional)').fill('Vai pensar até sexta');
  await folha.getByRole('button', { name: 'WhatsApp' }).click();
  await toast(page, 'Contato registrado.');
  await page.reload();
  await expect(
    page
      .getByTestId('tarefas-lead')
      .getByTestId('tarefa')
      .filter({
        has: page.getByTestId('selo-automatica'),
      }),
  ).toHaveCount(0);
  expect(await tarefasAutomaticas(leadId)).toEqual([
    { regra: 'sem_resposta_24h', cancelada: true },
  ]);
  await page.goto('/app/tarefas');
  await expect(page.getByTestId('tarefa').filter({ hasText: nome })).toHaveCount(0);
});

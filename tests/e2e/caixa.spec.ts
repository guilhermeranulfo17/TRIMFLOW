import { expect, test, type Browser, type Page } from '@playwright/test';
import { noBanco, zerarLimites } from './banco';
import {
  entrar,
  semRolagemHorizontal,
  SENHA_SEED,
  escolherTipoDeFesta,
  irAoPasso2,
} from './helpers';

/*
 * Etapa 6: caixa de leads, ações do vendedor e tarefas, no celular (um fluxo no desktop).
 * Tudo no Buffet Demo do seed. Cada teste cria o próprio lead (nome e WhatsApp únicos) e usa um
 * mês diferente da agenda: os testes rodam em paralelo e o banco não é zerado entre execuções.
 */

const SLUG = 'buffet-demo';

function whatsappNovo(): string {
  const n = String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-8);
  return `349${n}`;
}

const unico = (nome: string) => `${nome} ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

/** Data civil de hoje + n dias no fuso de Brasília, em yyyy-MM-dd. */
function dataMais(dias: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(Date.now() + dias * 86_400_000),
  );
}
const exibir = (iso: string) => iso.split('-').reverse().join('/');

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

/** Cliente para no passo 4 do link público: o lead nasce "Novo", sem orçamento concluído. */
async function leadNovoPeloLink(browser: Browser, nome: string, whatsapp: string) {
  const cliente = await visitante(browser);
  await cliente.goto(`/b/${SLUG}/orcamento`);
  // um toque antes da hidratação se perde com os testes em paralelo: repete até marcar
  await irAoPasso2(cliente);
  await cliente.getByRole('button', { name: 'Próximo mês' }).click();
  await cliente.locator('[data-testid^="data-"]:not([disabled])').nth(5).click();
  await cliente.locator('[data-testid="turno"]:not([disabled])').first().click();
  await cliente.getByRole('spinbutton', { name: 'Adultos' }).fill('40');
  // espera a prévia do servidor (sem motivo de bloqueio e com o preço) antes de continuar
  await expect(cliente.getByTestId('motivo')).toHaveText('');
  await expect(cliente.getByTestId('preco-resumo')).toContainText('R$');
  await expect(async () => {
    await cliente.getByRole('button', { name: 'Continuar' }).click();
    await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 3 de 6/, { timeout: 2_000 });
  }).toPass();
  await cliente.getByLabel('Seu nome').fill(nome);
  await cliente.getByLabel('Seu WhatsApp').fill(whatsapp);
  await cliente.getByRole('checkbox').check();
  await cliente.waitForTimeout(2_600); // tempo mínimo de preenchimento (anti-robô)
  await cliente.getByRole('button', { name: 'Ver pacotes e valores' }).click();
  await expect(cliente.getByTestId('passo-atual')).toHaveText(/Passo 4 de 6/);
  await cliente.context().close();
}

/** Orçamento interno salvo (lead "Em andamento"); devolve o link da proposta. */
async function orcamentoInterno(
  page: Page,
  o: { whatsapp: string; nome: string; mesesAFrente: number },
): Promise<string> {
  await page.goto('/app/orcamentos/novo');
  await page.getByLabel('WhatsApp do cliente').fill(o.whatsapp);
  await page.getByLabel('Nome do cliente').fill(o.nome);
  await escolherTipoDeFesta(page);
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
  return (await page.getByTestId('link-proposta').getAttribute('href'))!.replace(
    /^https?:\/\/[^/]+/,
    '',
  );
}

/** Abre o detalhe do lead pela busca da caixa. */
async function abrirLead(page: Page, nome: string, filtros = '') {
  await page.goto(`/app/leads?q=${encodeURIComponent(nome)}${filtros}`);
  const card = page.getByTestId('card-lead').filter({ hasText: nome });
  await card.getByRole('link', { name: nome }).click();
  await expect(page).toHaveURL(/\/app\/leads\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(nome);
}

async function maisAcoes(page: Page, item: string) {
  await page.getByRole('button', { name: 'Mais ações' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.beforeEach(async () => {
  await zerarLimites();
});

test.describe('no desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('vendedor toca em "Pré-reservas vencendo", confirma o sinal e o lead sai da caixa como Reservado', async ({
    page,
  }) => {
    await entrar(page, 'vendedor@demo.local', SENHA_SEED);
    const nome = unico('Sílvia Sinal');
    // cada execução confirma uma reserva: sorteia o mês (nenhum outro teste usa 13 a 18)
    const mesesAFrente = 13 + Math.floor(Math.random() * 6);
    await orcamentoInterno(page, { whatsapp: whatsappNovo(), nome, mesesAFrente });
    await page.getByRole('button', { name: 'Pré-reservar a data' }).click();
    await expect(page.getByText(/Pré-reservado até/)).toBeVisible();

    await page.goto('/app/leads');
    await expect(page.getByTestId('topo-hoje')).toBeVisible();
    await expect(async () => {
      await page.getByTestId('hoje-pre_reservas').click();
      await expect(page).toHaveURL(/\/app\/leads\?ver=pre_reservas$/, { timeout: 2_000 });
    }).toPass();
    await expect(page.getByTestId('hoje-pre_reservas')).toHaveAttribute('aria-current', 'true');
    const card = page.getByTestId('card-lead').filter({ hasText: nome });
    // a pré-reserva recém-criada é a que vence por último: pode estar numa página seguinte
    while (!(await card.isVisible())) {
      await page.getByRole('button', { name: 'Carregar mais' }).click();
      await page.waitForTimeout(300);
    }
    await expect(card).toHaveAttribute('data-grupo', '1');
    await expect(card.getByTestId('motivo')).toContainText('Pré-reserva vence em');
    for (const outro of await page.getByTestId('card-lead').all()) {
      await expect(outro).toHaveAttribute('data-grupo', '1');
    }
    expect(await semRolagemHorizontal(page)).toBe(true);

    await card.getByRole('link', { name: nome }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(nome);
    const item = page.getByTestId('reserva-lead').getByTestId('item-reserva');
    await item.getByRole('button', { name: 'Confirmar (sinal pago)' }).click();
    await item.getByRole('textbox').first().fill('1.500,00');
    await item.getByRole('button', { name: 'Confirmar reserva' }).click();
    await toast(page, 'Reserva confirmada.');
    await expect(page.getByTestId('motivo-detalhe')).toHaveText('Reservado');
    await expect(page.getByRole('heading', { name: 'Reserva', exact: true })).toBeVisible();

    // Fora da caixa padrão e do atalho; aparece só filtrando por Reservado.
    await page.goto(`/app/leads?ver=pre_reservas&q=${encodeURIComponent(nome)}`);
    await expect(page.getByTestId('caixa-vazia')).toBeVisible();
    await page.goto(`/app/leads?q=${encodeURIComponent(nome)}`);
    await expect(page.getByTestId('caixa-vazia')).toBeVisible();
    await page.goto(`/app/leads?q=${encodeURIComponent(nome)}&status=reservado`);
    await expect(page.getByTestId('card-lead').filter({ hasText: nome })).toContainText(
      'Reservado',
    );
  });
});

test('registrar contato num lead novo muda para Em andamento e tira a prioridade de "esperando"', async ({
  page,
  browser,
}) => {
  const nome = unico('Renata Contato');
  await leadNovoPeloLink(browser, nome, whatsappNovo());
  await entrar(page, 'vendedor@demo.local', SENHA_SEED);

  await page.goto(`/app/leads?q=${encodeURIComponent(nome)}`);
  const card = page.getByTestId('card-lead').filter({ hasText: nome });
  await expect(card).toHaveAttribute('data-grupo', '5');
  await expect(card).toContainText('Novo');
  await expect(card.getByTestId('motivo')).toHaveText(/Chegou agora|Esperando/);

  await card.getByRole('button', { name: 'Registrar contato' }).click();
  const folha = page.getByRole('dialog');
  await folha.getByLabel('Resumo da conversa (opcional)').fill('Quer ver o salão no sábado');
  await folha.getByRole('button', { name: 'WhatsApp' }).click();
  // otimista: o cartão muda antes da resposta do servidor
  await expect(card).toContainText('Em andamento');
  await expect(card.getByTestId('motivo')).toHaveText(/Contato registrado agora$/);
  await toast(page, 'Contato registrado.');

  await page.reload();
  await expect(card).toContainText('Em andamento');
  await expect(card).not.toHaveAttribute('data-grupo', '5');
  await expect(card.getByTestId('motivo')).not.toHaveText(/Chegou agora|Esperando/);
  await expect(card).toContainText('VD'); // virou responsável: Vendedor Demo

  await card.getByRole('link', { name: nome }).click();
  await expect(page.getByTestId('linha-do-tempo')).toContainText(
    'falou com o cliente pelo WhatsApp: Quer ver o salão no sábado',
  );
  await expect(page.getByTestId('responsavel')).toContainText('Vendedor Demo');
});

test('criar tarefa para amanhã, adiar e concluir na tela de Tarefas', async ({ page, browser }) => {
  const nome = unico('Tânia Tarefa');
  await leadNovoPeloLink(browser, nome, whatsappNovo());
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  await abrirLead(page, nome);

  const titulo = unico('Mandar fotos do salão');
  await page.getByTestId('barra-acoes').getByRole('button', { name: 'Tarefa' }).click();
  const folha = page.getByRole('dialog');
  await folha.getByLabel('O que fazer').fill(titulo);
  await expect(folha.getByRole('radio', { name: 'amanhã 9h' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await folha.getByRole('button', { name: 'Criar tarefa' }).click();
  await toast(page, 'Tarefa criada.');
  const naLead = page.getByTestId('tarefas-lead').getByTestId('tarefa').filter({ hasText: titulo });
  await expect(naLead).toContainText(`${exibir(dataMais(1))} 09:00`);

  await page.goto('/app/tarefas');
  const tarefa = page.getByTestId('tarefas-proximas').getByTestId('tarefa').filter({
    hasText: titulo,
  });
  await expect(tarefa).toContainText(`${exibir(dataMais(1))} 09:00`);
  await expect(tarefa.getByRole('link', { name: new RegExp(nome) })).toBeVisible();
  expect(await semRolagemHorizontal(page)).toBe(true);

  await tarefa.getByRole('button', { name: 'Adiar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Em 3 dias' }).click();
  await toast(page, 'Tarefa adiada.');
  await expect(tarefa).toContainText(`${exibir(dataMais(3))} 09:00`);

  await tarefa.getByRole('button', { name: `Concluir: ${titulo}` }).click();
  await toast(page, 'Tarefa concluída.');
  await page.reload();
  await expect(
    page.getByTestId('tarefas-feitas').getByTestId('tarefa').filter({ hasText: titulo }),
  ).toContainText('Feita em');
  await expect(
    page.getByTestId('tarefas-proximas').getByTestId('tarefa').filter({ hasText: titulo }),
  ).toHaveCount(0);

  await abrirLead(page, nome);
  await expect(page.getByTestId('linha-do-tempo')).toContainText(`concluiu "${titulo}"`);
});

test('marcar perdido por "Preço" num lead pré-reservado libera a data na Agenda; reabrir', async ({
  page,
}) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  const nome = unico('Paulo Perdido');
  await orcamentoInterno(page, { whatsapp: whatsappNovo(), nome, mesesAFrente: 11 });
  await page.getByRole('button', { name: 'Pré-reservar a data' }).click();
  await expect(page.getByText(/Pré-reservado até/)).toBeVisible();
  const { data } = await noBanco(async (sql) => {
    const [l] = await sql<{ data: string }[]>`
      select to_char(r.data, 'YYYY-MM-DD') as data from public.reservas r
      join public.leads l on l.id = r.lead_id
      where l.nome = ${nome} and r.status = 'ativa'`;
    return l!;
  });
  await page.goto(`/app/agenda?mes=${data.slice(0, 7)}`);
  await expect(page.getByTestId(`lista-dia-${data}`)).toContainText(nome);

  await abrirLead(page, nome);
  await maisAcoes(page, 'Marcar perdido');
  const folha = page.getByRole('dialog');
  await expect(folha.getByRole('alert')).toContainText('A pré-reserva deste lead será cancelada');
  await folha.getByRole('radio', { name: 'Preço' }).click();
  await folha.getByLabel('Detalhe (opcional)').fill('Achou caro');
  await folha.getByRole('button', { name: 'Marcar como perdido' }).click();
  await toast(page, 'Lead marcado como perdido.');
  await expect(page.getByTestId('perda')).toContainText('Preço');
  await expect(page.getByTestId('motivo-detalhe')).toHaveText('Perdido');
  await expect(page.getByTestId('reserva-lead')).toHaveCount(0);
  await expect(page.getByTestId('linha-do-tempo')).toContainText(
    'marcou como perdido: Preço (Achou caro)',
  );

  // A data ficou livre na Agenda.
  await page.goto(`/app/agenda?mes=${data.slice(0, 7)}`);
  await expect(page.getByText(nome)).toHaveCount(0);

  await abrirLead(page, nome, '&status=perdido');
  await maisAcoes(page, 'Reabrir');
  await toast(page, 'Lead reaberto.');
  // pré-reservado volta como Em andamento: a pré-reserva foi cancelada
  await expect(page.getByTestId('detalhe-lead').locator('header')).toContainText('Em andamento');
  await expect(page.getByTestId('perda')).toHaveCount(0);
  await expect(page.getByTestId('linha-do-tempo')).toContainText('reabriu o lead');
});

test('confirmar com dia e hora uma visita pedida pelo link', async ({ page, browser }) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  const nome = unico('Vera Visita');
  const link = await orcamentoInterno(page, { whatsapp: whatsappNovo(), nome, mesesAFrente: 12 });

  const cliente = await visitante(browser);
  await cliente.goto(link);
  await cliente.getByRole('button', { name: 'Quero visitar o espaço' }).click();
  await cliente.getByLabel('Data preferida').fill(dataMais(3));
  await cliente.getByText('Tarde', { exact: true }).click();
  await cliente.getByRole('button', { name: 'Pedir visita' }).click();
  await expect(cliente.getByRole('status')).toContainText('Pedido de visita enviado!');

  await page.goto(`/app/leads?q=${encodeURIComponent(nome)}`);
  const card = page.getByTestId('card-lead').filter({ hasText: nome });
  await expect(card).toHaveAttribute('data-grupo', '2');
  await expect(card.getByTestId('motivo')).toContainText('Pediu visita');
  await card.getByRole('link', { name: nome }).click();

  const visita = page.getByTestId('visitas-lead').getByTestId('visita');
  await expect(visita).toContainText(`Pediu visita: ${exibir(dataMais(3))} (tarde)`);
  await visita.getByRole('button', { name: 'Confirmar dia e hora' }).click();
  const folha = page.getByRole('dialog');
  await folha.getByRole('textbox', { name: 'Dia e hora' }).fill(`${dataMais(3)}T15:30`);
  await folha.getByRole('button', { name: 'Confirmar visita' }).click();
  await toast(page, 'Visita confirmada.');
  await expect(visita).toContainText(`Visita confirmada: ${exibir(dataMais(3))} 15:30`);
  await expect(page.getByTestId('detalhe-lead').locator('header')).toContainText('Quente');
  await expect(page.getByTestId('linha-do-tempo')).toContainText(
    `confirmou a visita para ${exibir(dataMais(3))} 15:30`,
  );
});

test('mensagem pronta abre o WhatsApp com o texto certo (link wa.me)', async ({
  page,
  browser,
  context,
}) => {
  const nome = unico('Mirela Mensagem');
  const whatsapp = whatsappNovo();
  await leadNovoPeloLink(browser, nome, whatsapp);
  await entrar(page, 'dono@demo.local', SENHA_SEED);
  await abrirLead(page, nome);

  await page.getByTestId('barra-acoes').getByRole('button', { name: 'WhatsApp' }).click();
  const folha = page.getByTestId('mensagem-pronta');
  await expect(folha.getByRole('radio', { name: 'Primeiro contato' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const texto = folha.getByLabel('Texto da mensagem');
  await expect(texto).toHaveValue(new RegExp(`^Oi, ${nome.split(' ')[0]}!`));
  await expect(texto).toHaveValue(/Buffet Demo/);
  await expect(texto).not.toHaveValue(/undefined|null/);

  // O vendedor ajusta o texto; o link leva exatamente o que está na caixa.
  await texto.fill(`${await texto.inputValue()}\nTe espero!`);
  const final = await texto.inputValue();
  const abrir = folha.getByTestId('abrir-whatsapp');
  const href = (await abrir.getAttribute('href'))!;
  expect(href.startsWith(`https://wa.me/55${whatsapp}?text=`)).toBe(true);
  expect(decodeURIComponent(href.split('?text=')[1]!)).toBe(final);

  // Não sai para a internet no teste: o wa.me responde localmente.
  await context.route('https://wa.me/**', (r) => r.fulfill({ body: 'ok' }));
  const [aba] = await Promise.all([context.waitForEvent('page'), abrir.click()]);
  expect(aba.url().startsWith(`https://wa.me/55${whatsapp}`)).toBe(true);
  await aba.close();

  await page.reload();
  await expect(page.getByTestId('linha-do-tempo')).toContainText(
    'abriu o WhatsApp com a mensagem "Primeiro contato"',
  );
});

test('filtros e busca ficam na URL e voltar do navegador mantém os filtros', async ({ page }) => {
  await entrar(page, 'dono@demo.local', SENHA_SEED);

  // Filtro pelo sheet (celular): Perdido
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  const folha = page.getByRole('dialog');
  await folha.getByRole('button', { name: 'Perdido', exact: true }).click();
  await folha.getByRole('button', { name: 'Aplicar' }).click();
  await expect(folha).toBeHidden();
  await expect(page).toHaveURL(/\/app\/leads\?status=perdido$/);
  await expect(page.getByRole('button', { name: 'Filtros (1 ligados)' })).toBeVisible();
  const cards = page.getByTestId('card-lead');
  await expect(cards.first()).toBeVisible();
  for (const c of await cards.all()) await expect(c).toContainText('Perdido');

  // Busca por telefone com máscara, somada ao filtro
  const busca = page.getByRole('searchbox', { name: 'Buscar lead' });
  await expect(async () => {
    await busca.fill('(34) 99111-4409');
    await busca.press('Enter');
    await expect(page).toHaveURL(/q=%2834%29\+99111-4409/, { timeout: 2_000 });
  }).toPass();
  await expect(page).toHaveURL(/status=perdido/);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Camila Duarte');

  // Abre o lead e volta: filtros e busca continuam
  await cards.first().getByRole('link', { name: 'Camila Duarte' }).click();
  await expect(page.getByTestId('perda')).toContainText('Preço');
  await page.goBack();
  await expect(page).toHaveURL(/status=perdido/);
  await expect(page).toHaveURL(/q=/);
  await expect(busca).toHaveValue('(34) 99111-4409');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Camila Duarte');

  // Voltar mais uma vez tira a busca e mantém o filtro de status
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/leads\?status=perdido$/);
  await expect(busca).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Filtros (1 ligados)' })).toBeVisible();

  // Limpar volta para a caixa padrão (sem fechados)
  await expect(async () => {
    await page.getByTestId('filtros-ativos').getByRole('button', { name: 'Limpar' }).click();
    await expect(page).toHaveURL(/\/app\/leads$/, { timeout: 2_000 });
  }).toPass();
  await expect(page.getByTestId('card-lead').filter({ hasText: 'Camila Duarte' })).toHaveCount(0);
});

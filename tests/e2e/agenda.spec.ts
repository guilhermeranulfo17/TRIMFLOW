import { expect, test, type Page } from '@playwright/test';
import { cadastrar, emailUnico, entrar, SENHA_SEED, semRolagemHorizontal } from './helpers';

/*
 * Agenda (Etapa 3), no celular. Os fluxos do dono rodam numa empresa nova com o modelo de
 * exemplo (Salão principal; turnos Almoço 10h, Tarde 15h e Noite 20h), para não interferir
 * no Buffet Demo nem nos outros testes em paralelo.
 */

/** Data civil de hoje + n dias no fuso de Brasília. */
function dataMais(dias: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(Date.now() + dias * 86_400_000),
  );
}

async function empresaComModelo(page: Page, buffet: string) {
  await cadastrar(page, {
    nome: 'Dona Agenda',
    email: emailUnico('agenda'),
    whatsapp: '34991355450',
    senha: 'senha-forte-123',
    buffet,
    segmento: 'Buffet infantil',
  });
  await expect(page).toHaveURL(/\/app\/leads$/);
  await page.goto('/app/empresa/catalogo');
  await page.getByRole('button', { name: 'Carregar modelo de exemplo' }).click();
  await expect(page.getByTestId('card-pacote').first()).toBeVisible();
  await page.goto('/app/agenda');
}

async function toast(page: Page, texto: string | RegExp) {
  await expect(page.getByTestId('toast').filter({ hasText: texto })).toBeVisible();
}

async function preencherReserva(page: Page, data: string, turno: string, cliente: string) {
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Data').fill(data);
  await dialogo.getByLabel('Turno').selectOption({ label: turno });
  await dialogo.getByLabel('Nome do cliente').fill(cliente);
  return dialogo;
}

test.describe('agenda', () => {
  test('dono registra evento fechado fora e o mesmo slot é recusado depois', async ({ page }) => {
    await empresaComModelo(page, 'Buffet Agenda Um');
    await expect(page.getByText('Nenhum evento registrado.')).toBeVisible();
    const data = dataMais(20);

    await page.getByRole('button', { name: 'Registrar evento' }).click();
    const dialogo = await preencherReserva(page, data, 'Tarde (15:00)', 'Ana Souza');
    await dialogo.getByLabel('Convidados (opcional)').fill('60');
    await dialogo.getByRole('button', { name: 'Registrar evento' }).click();
    await toast(page, 'Evento registrado na agenda.');

    const dia = page.getByTestId(`lista-dia-${data}`);
    await expect(dia).toContainText('Ana Souza');
    await expect(dia).toContainText('Reservado');
    expect(await semRolagemHorizontal(page)).toBe(true);

    // Mesmo espaço, data e turno: o banco recusa (nenhuma data vendida duas vezes).
    await page.getByRole('button', { name: 'Registrar evento' }).click();
    const segundo = await preencherReserva(page, data, 'Tarde (15:00)', 'Outra Pessoa');
    await segundo.getByRole('button', { name: 'Registrar evento' }).click();
    await toast(page, 'Esse horário já está ocupado');
    await expect(segundo).toBeVisible();

    // O painel do dia mostra o slot reservado.
    await page.keyboard.press('Escape');
    await dia.click();
    const tarde = page.getByRole('dialog').getByTestId('slot').filter({ hasText: 'Tarde' });
    await expect(tarde).toContainText('Reservado');
    await expect(tarde).toContainText('Ana Souza');
  });

  test('pré-reserva confirmada com sinal vira reservado', async ({ page }) => {
    await empresaComModelo(page, 'Buffet Agenda Dois');
    const data = dataMais(25);

    await page.getByRole('button', { name: 'Pré-reservar' }).click();
    const dialogo = await preencherReserva(page, data, 'Noite (20:00)', 'Bruno Lima');
    await dialogo.getByRole('button', { name: 'Pré-reservar' }).click();
    await toast(page, 'Pré-reserva criada.');
    const dia = page.getByTestId(`lista-dia-${data}`);
    await expect(dia).toContainText('Pré-reservado');
    await expect(dia).toContainText(/vence em \d+ ?(h|dias)/);

    await dia.click();
    const item = page.getByRole('dialog').getByTestId('item-reserva');
    await item.getByRole('button', { name: 'Confirmar (sinal pago)' }).click();
    await item.getByRole('textbox').first().fill('1.500,00');
    await item.getByRole('button', { name: 'Confirmar reserva' }).click();
    await toast(page, 'Reserva confirmada.');
    await expect(item).toContainText('Reservado');
    await expect(item).toContainText('Sinal R$');
    await page.keyboard.press('Escape');
    await expect(dia).toContainText('Reservado');
  });

  test('dono bloqueia um período de 3 dias', async ({ page }) => {
    await empresaComModelo(page, 'Buffet Agenda Três');
    const de = dataMais(30);
    const ate = dataMais(32);

    await page.getByRole('button', { name: 'Bloquear datas' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('De', { exact: true }).fill(de);
    await dialogo.getByLabel('Até', { exact: true }).fill(ate);
    await dialogo.getByLabel('Motivo (opcional)').fill('Férias coletivas');
    await dialogo.getByRole('button', { name: 'Bloquear' }).click();
    await toast(page, 'Período bloqueado (3 dias).');

    for (const data of [de, dataMais(31), ate]) {
      const dia = page.getByTestId(`lista-dia-${data}`);
      await expect(dia).toContainText('Bloqueado');
      await expect(dia).toContainText('Férias coletivas');
    }

    // Data bloqueada não aceita reserva.
    await page.getByRole('button', { name: 'Registrar evento' }).click();
    const reserva = await preencherReserva(page, de, 'Almoço (10:00)', 'Carla');
    await reserva.getByRole('button', { name: 'Registrar evento' }).click();
    await toast(page, 'Essa data está bloqueada na agenda.');
  });

  test('vendedor vê a agenda, cria pré-reserva e não bloqueia', async ({ page }) => {
    await entrar(page, 'vendedor@demo.local', SENHA_SEED);
    await page.goto('/app/agenda');
    await expect(page.getByRole('button', { name: 'Registrar evento' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bloquear datas' })).toHaveCount(0);

    // Data longe do seed, variando entre execuções locais.
    const data = dataMais(120 + Math.floor(Math.random() * 200));
    await page.getByRole('button', { name: 'Pré-reservar' }).click();
    const dialogo = await preencherReserva(page, data, 'Tarde (15:00)', 'Cliente do Vendedor');
    await dialogo.getByRole('button', { name: 'Pré-reservar' }).click();
    await toast(page, 'Pré-reserva criada.');

    // A lista do celular mostra os próximos 60 dias; abre o mês da data escolhida.
    await page.goto(`/app/agenda?mes=${data.slice(0, 7)}`);
    const dia = page.getByTestId(`lista-dia-${data}`);
    await expect(dia).toContainText('Cliente do Vendedor');
    await dia.click();
    const painel = page.getByRole('dialog');
    await expect(painel.getByTestId('slot').first()).toBeVisible();
    await expect(painel.getByRole('button', { name: /Bloquear/ })).toHaveCount(0);
    await expect(painel.getByRole('button', { name: 'Confirmar (sinal pago)' })).toBeVisible();
  });
});

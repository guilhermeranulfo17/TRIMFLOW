import { expect, test, type Page } from '@playwright/test';
import { noBanco } from './banco';
import { entrar, semRolagemHorizontal, SENHA_SEED } from './helpers';

/*
 * Etapa 13: funil de leads. Cada teste cria o próprio lead novo (nome e WhatsApp sorteados) e
 * busca por ele. Celular: abas e "Mover para". PC: arrastar o card de uma coluna para outra.
 * Mover sempre abre a ação de verdade (registrar contato, marcar perdido, reabrir) ou explica
 * por que não dá.
 */

async function leadNovo(): Promise<string> {
  return noBanco(async (sql) => {
    const sufixo = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    const nome = `Funil ${sufixo}`;
    await sql`insert into public.leads (empresa_id, nome, whatsapp_e164)
      select id, ${nome}, ${`+553498${sufixo}1`} from public.empresas where slug = 'buffet-demo'`;
    return nome;
  });
}

async function abrirFunil(page: Page, nome: string) {
  await page.goto(`/app/leads?visao=funil&q=${encodeURIComponent(nome)}`);
  await expect(page.getByTestId('funil')).toBeVisible();
}

test.describe('funil de leads', () => {
  test('celular: abas, mover para Em conversa, perder e reabrir', async ({ page }, info) => {
    test.skip(info.project.name !== 'celular', 'só no celular');
    const nome = await leadNovo();
    await entrar(page, 'dono@demo.local', SENHA_SEED);

    // Lista → Funil mantém a busca
    await page.goto(`/app/leads?q=${encodeURIComponent(nome)}`);
    await page.getByTestId('visao-funil').click();
    await expect(page).toHaveURL(/visao=funil/);
    await expect(page).toHaveURL(/q=Funil/);
    await expect(page.getByTestId('aba-novo')).toContainText('1');
    expect(await semRolagemHorizontal(page)).toBe(true);

    const card = page.getByTestId('card-funil').filter({ hasText: nome });
    await card.getByTestId('mover-card').click();
    await page.getByTestId('destinos').getByRole('button', { name: 'Em conversa' }).click();
    await page.getByRole('button', { name: 'WhatsApp' }).click();
    await expect(page.getByText('Contato registrado.')).toBeVisible();
    await expect(page.getByTestId('aba-conversa')).toContainText('1');
    await page.getByTestId('aba-conversa').click();

    // perdido: pede o motivo
    await card.getByTestId('mover-card').click();
    await page.getByTestId('destinos').getByRole('button', { name: 'Perdidos e frios' }).click();
    await page.getByRole('radio', { name: 'Preço' }).click();
    await page.getByRole('button', { name: 'Marcar como perdido' }).click();
    await expect(page.getByTestId('aba-perdido')).toContainText('1');

    // dos perdidos só volta para Em conversa (reabre)
    await page.getByTestId('aba-perdido').click();
    await card.getByTestId('mover-card').click();
    const destinos = page.getByTestId('destinos').getByRole('button');
    await expect(destinos).toHaveCount(1);
    await destinos.click();
    await expect(page.getByTestId('aba-conversa')).toContainText('1');
  });

  test('PC: arrastar abre a ação; movimento impossível explica o motivo', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'só no PC');
    const nome = await leadNovo();
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    await abrirFunil(page, nome);

    const card = () => page.getByTestId('card-funil').filter({ hasText: nome });
    await expect(page.getByTestId('coluna-novo').getByTestId('card-funil')).toHaveCount(1);

    // para Reservado direto: não dá
    await card().dragTo(page.getByTestId('coluna-reservado'));
    await expect(page.getByText('Primeiro a pré-reserva')).toBeVisible();

    // para Em conversa: registra o contato e o card muda de coluna
    await card().dragTo(page.getByTestId('coluna-conversa'));
    await page.getByRole('button', { name: 'Ligação' }).click();
    await expect(page.getByTestId('coluna-conversa').getByTestId('card-funil')).toHaveCount(1);
    await expect(page.getByTestId('coluna-novo').getByTestId('card-funil')).toHaveCount(0);

    // de volta para Novo: não dá
    await card().dragTo(page.getByTestId('coluna-novo'));
    await expect(page.getByText('Um lead não volta a ser novo.')).toBeVisible();

    // para a faixa dos perdidos: pede o motivo
    await card().dragTo(page.getByTestId('coluna-perdido'));
    await page.getByRole('radio', { name: 'Desistiu da festa' }).click();
    await page.getByRole('button', { name: 'Marcar como perdido' }).click();
    await expect(page.getByTestId('coluna-conversa').getByTestId('card-funil')).toHaveCount(0);
    await expect(page.getByTestId('coluna-perdido')).toContainText('1');
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('vendedor usa o funil e pode mover os cards', async ({ page }, info) => {
    test.skip(info.project.name !== 'celular', 'só no celular');
    const nome = await leadNovo();
    await entrar(page, 'vendedor@demo.local', SENHA_SEED);
    await abrirFunil(page, nome);
    await expect(page.getByTestId('card-funil').filter({ hasText: nome })).toBeVisible();
    await expect(page.getByTestId('mover-card')).toHaveCount(1);
  });
});

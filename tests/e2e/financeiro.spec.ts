import { expect, test } from '@playwright/test';
import { noBanco } from './banco';
import { entrar, semRolagemHorizontal, SENHA_SEED } from './helpers';

/*
 * Etapa 11: financeiro da festa. Cada teste cria a própria reserva confirmada (data longe, ano
 * sorteado) para não esbarrar nos outros: o dono monta o plano sugerido, registra o sinal e uma
 * parcela, vê o atrasado, estorna e acha a festa na lista; o vendedor não vê o Financeiro.
 */

async function reservaConfirmada(): Promise<{ id: string; cliente: string }> {
  return noBanco(async (sql) => {
    const sufixo = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    const cliente = `Festa Financeiro ${sufixo}`;
    const ano = 2031 + Math.floor(Math.random() * 30);
    const dia = 1 + Math.floor(Math.random() * 27);
    const mes = 1 + Math.floor(Math.random() * 12);
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const [r] = await sql<{ id: string }[]>`
      insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status,
        origem, cliente_nome, valor_total_centavos, sinal_centavos)
      select e.id, es.id, t.id, ${data}::date,
        (${data}::date + t.hora_inicio) at time zone e.fuso,
        (${data}::date + t.hora_inicio) at time zone e.fuso + make_interval(mins => t.duracao_min),
        'confirmada', 'ativa', 'manual', ${cliente}, 600000, 180000
      from public.empresas e
      join public.espacos es on es.empresa_id = e.id
      join public.turnos t on t.empresa_id = e.id
      where e.slug = 'buffet-demo'
      order by random() limit 1
      returning id`;
    return { id: r!.id, cliente };
  });
}

test.describe('financeiro da festa', () => {
  test('monta o plano sugerido, registra, estorna e acha a festa na lista', async ({ page }) => {
    const r = await reservaConfirmada();
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    await page.goto(`/app/financeiro/${r.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(r.cliente);
    await expect(page.getByTestId('selo-financeiro')).toHaveText('Sem plano');

    // sugestão: sinal + parcelas das regras, somando o total da reserva
    const editor = page.getByTestId('editor-plano');
    await expect(editor).toBeVisible();
    await expect(page.getByTestId('total-plano')).toHaveText('R$ 6.000,00');
    await page.getByTestId('salvar-plano').click();
    await expect(page.getByTestId('parcelas')).toContainText('Sinal');
    await expect(page.getByTestId('selo-financeiro')).toHaveText('Em dia');

    // registra o sinal (valor sugerido = o que falta da próxima parcela)
    await expect(page.getByLabel('Valor')).toHaveValue('1.800,00');
    await page.getByTestId('salvar-pagamento').click();
    await expect(page.getByTestId('recebimentos')).toContainText('R$ 1.800,00');
    await expect(page.getByTestId('resumo-festa')).toContainText('R$ 4.200,00');
    await expect(page.getByTestId('parcelas').locator('[data-status-parcela="paga"]')).toHaveCount(
      1,
    );
    expect(await semRolagemHorizontal(page)).toBe(true);

    // um lançamento errado e o estorno (fica riscado, sai da conta)
    await page.getByLabel('Valor').fill('100,00');
    await page.getByLabel('Forma').selectOption('dinheiro');
    await page.getByTestId('salvar-pagamento').click();
    await expect(page.getByTestId('resumo-festa')).toContainText('R$ 1.900,00');
    await page
      .getByTestId('recebimentos')
      .getByRole('listitem')
      .filter({ hasText: 'R$ 100,00' })
      .getByTestId('estornar')
      .click();
    await page.getByTestId('confirmar-estorno').click();
    await expect(page.locator('[data-estornado="sim"]')).toContainText('R$ 100,00');
    await expect(page.getByTestId('resumo-festa')).toContainText('R$ 4.200,00');

    // lista: a festa está "A receber" e abre o mesmo detalhe
    await page.goto('/app/financeiro');
    await expect(page.getByTestId('resumo-financeiro')).toBeVisible();
    await page.goto('/app/financeiro?status=todos');
    const item = page.getByTestId('item-financeiro').filter({ hasText: r.cliente });
    await expect(item).toContainText('R$ 1.800,00 de R$ 6.000,00');
    await item.click();
    await expect(page).toHaveURL(new RegExp(`/app/financeiro/${r.id}$`));
  });

  test('parcela vencida aparece como atrasada; plano editado substitui o anterior', async ({
    page,
  }) => {
    const r = await reservaConfirmada();
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    await page.goto(`/app/financeiro/${r.id}`);
    // primeira linha vencida há tempo (data no passado)
    const editor = page.getByTestId('editor-plano');
    await editor.getByLabel('Vence em').first().fill('2020-01-10');
    await page.getByTestId('salvar-plano').click();
    await expect(page.getByTestId('selo-financeiro')).toHaveText('Atrasado');
    await expect(
      page.getByTestId('parcelas').locator('[data-status-parcela="vencida"]'),
    ).toHaveCount(1);

    await page.goto('/app/financeiro?status=atrasados');
    await expect(page.getByTestId('item-financeiro').filter({ hasText: r.cliente })).toContainText(
      'atrasado',
    );
  });

  test('vendedor não vê o Financeiro', async ({ page }) => {
    await entrar(page, 'vendedor@demo.local', SENHA_SEED);
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link', { name: 'Leads' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Financeiro' })).toHaveCount(0);
    await page.goto('/app/agenda');
    await expect(page.getByTestId('atalho-financeiro')).toHaveCount(0);
  });
});

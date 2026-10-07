import { expect, test } from '@playwright/test';
import { noBanco } from './banco';
import { entrar, semRolagemHorizontal, SENHA_SEED } from './helpers';

/*
 * Etapa 12: aba Clientes. Cada teste cria o próprio cliente (festa feita direto na Agenda, sem
 * lead, com WhatsApp e nome sorteados): a festa fez quase um ano, então ele aparece em "Hora de
 * chamar de novo"; a ficha mostra as festas, o total (só o dono), a mensagem pronta e leva ao
 * orçamento da próxima festa com o nome e o WhatsApp preenchidos.
 */

async function clienteDeUmAno(): Promise<{ nome: string; zap: string; digitos: string }> {
  return noBanco(async (sql) => {
    const sufixo = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    const nome = `Cliente Volta ${sufixo}`;
    const digitos = `9${sufixo.slice(0, 4)}${sufixo.slice(2)}`.slice(0, 9);
    const zap = `+5534${digitos}`;
    // duas festas: a mais recente faz um ano daqui a 20 dias, a outra no ano anterior
    for (const [dias, valor] of [
      [345, 500000],
      [710, 300000],
    ] as const) {
      await sql`
        insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio, fim, tipo,
          status, origem, cliente_nome, cliente_whatsapp_e164, valor_total_centavos)
        select e.id, es.id, t.id, d.data,
          (d.data + t.hora_inicio) at time zone e.fuso,
          (d.data + t.hora_inicio) at time zone e.fuso + make_interval(mins => t.duracao_min),
          'confirmada', 'realizada', 'manual', ${nome}, ${zap}, ${valor}
        from public.empresas e
        cross join lateral (select ((now() at time zone e.fuso)::date - ${dias}::int) as data) d
        join public.espacos es on es.empresa_id = e.id
        join public.turnos t on t.empresa_id = e.id
        where e.slug = 'buffet-demo'
        order by random() limit 1`;
    }
    return { nome, zap, digitos };
  });
}

test.describe('clientes', () => {
  test('hora de chamar, busca, ficha com total e mensagem, e nova festa', async ({ page }) => {
    const c = await clienteDeUmAno();
    await entrar(page, 'dono@demo.local', SENHA_SEED);
    await page.goto('/app/clientes?filtro=chamar');
    const item = page.getByTestId('item-cliente').filter({ hasText: c.nome });
    await expect(item).toBeVisible();
    await expect(item.getByTestId('selo-chamar')).toBeVisible();
    await expect(item).toContainText('2 festas');
    await expect(item).toContainText('R$ 8.000,00');
    expect(await semRolagemHorizontal(page)).toBe(true);

    // busca pelos dígitos do telefone (em "Todos")
    await page.goto('/app/clientes');
    await page.getByTestId('busca-clientes').fill(c.digitos.slice(-6));
    await page.getByTestId('busca-clientes').press('Enter');
    await expect(page).toHaveURL(/busca=/);
    await expect(page.getByTestId('item-cliente')).toHaveCount(1);
    await page.getByTestId('item-cliente').click();

    // ficha: festas, total, mensagem pronta no WhatsApp
    await expect(page).toHaveURL(/\/app\/clientes\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(c.nome);
    await expect(page.getByTestId('festa-cliente')).toHaveCount(2);
    await expect(page.getByTestId('total-cliente')).toHaveText('R$ 8.000,00');
    const zap = await page.getByTestId('chamar-whatsapp').getAttribute('href');
    expect(zap).toContain(`https://wa.me/${c.zap.slice(1)}?text=`);
    expect(decodeURIComponent(zap!)).toContain('Já faz quase um ano da festa');
    await expect(page.getByTestId('pagamentos-festa').first()).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);

    // nova festa: orçamento com o nome e o WhatsApp da festa anterior
    await page.getByTestId('nova-festa').click();
    await expect(page).toHaveURL(/\/app\/orcamentos\/novo\?reserva=/);
    await expect(page.getByLabel('Nome do cliente')).toHaveValue(c.nome);
  });

  test('vendedor vê os clientes sem valores; no celular o atalho fica em Leads', async ({
    page,
  }) => {
    const c = await clienteDeUmAno();
    await entrar(page, 'vendedor@demo.local', SENHA_SEED);
    await page.goto('/app/leads');
    await page.getByTestId('atalho-clientes').click();
    await expect(page).toHaveURL(/\/app\/clientes$/);
    await page.getByTestId('busca-clientes').fill(c.nome);
    await page.getByTestId('busca-clientes').press('Enter');
    const item = page.getByTestId('item-cliente').filter({ hasText: c.nome });
    await expect(item).toBeVisible();
    await expect(item).not.toContainText('R$');
    await item.click();
    await expect(page.getByTestId('festa-cliente')).toHaveCount(2);
    await expect(page.getByTestId('total-cliente')).toHaveCount(0);
    await expect(page.getByTestId('pagamentos-festa')).toHaveCount(0);
    await expect(page.getByTestId('chamar-whatsapp')).toBeVisible();
  });
});

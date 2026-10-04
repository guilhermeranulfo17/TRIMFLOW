import { expect, test, type Page } from '@playwright/test';
import { noBanco } from './banco';

async function esperarToast(page: Page, texto: string) {
  await expect(page.getByTestId('toast').filter({ hasText: texto })).toBeVisible();
}

/*
 * Etapa 9B · B.5 Conta de demonstração, no celular: entra pela landing sem senha, vê o painel
 * cheio, nada é salvo (mensagem com "Criar conta grátis"), o link público da demo não cria lead
 * real, a landing não conta o clique como "Testar grátis" e, depois de 2 horas, sai para o cadastro.
 */

const DEMO = process.env.NEXT_PUBLIC_DEMO_SLUG;

test.skip(!DEMO, 'NEXT_PUBLIC_DEMO_SLUG não configurado');

test('demonstração: entra sem senha, vê tudo, não salva nada e termina no cadastro', async ({
  page,
  context,
}) => {
  const cliques = () =>
    noBanco(async (sql) => {
      const [r] = await sql<{ n: number }[]>`select coalesce(sum(total), 0)::int as n
        from public.landing_contagem where evento = 'clicou_teste'`;
      return r!.n;
    });
  const antes = await cliques();

  await page.goto('/');
  await page.getByTestId('ver-demo').click();
  await expect(page).toHaveURL(/\/app\/leads$/, { timeout: 30_000 });
  await expect(page.getByTestId('faixa-demo')).toBeVisible();
  await expect(page.getByText('Patrícia Lima').first()).toBeVisible();

  // as telas principais abrem com os dados (nenhuma leitura tenta gravar)
  for (const caminho of [
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
    '/app/conta/seguranca',
  ]) {
    const r = await page.goto(caminho);
    expect(r?.status(), caminho).toBe(200);
    await expect(page.getByTestId('faixa-demo'), caminho).toBeVisible();
  }

  // escrever é recusado com a mensagem da demo e o caminho para criar a conta
  await page.goto('/app/empresa');
  await page.getByLabel('Cidade').fill('Outra cidade');
  await page.locator('#nome').press('Tab');
  await page.getByRole('button', { name: 'Salvar' }).first().click();
  await esperarToast(page, 'Esta é uma demonstração. Crie sua conta grátis para usar de verdade.');
  await expect(page.getByTestId('toast-criar-conta')).toHaveAttribute(
    'href',
    '/auth/sair?para=cadastro',
  );
  const cidade = await noBanco(async (sql) => {
    const [e] = await sql<{ cidade: string }[]>`select cidade from public.empresas where eh_demo`;
    return e!.cidade;
  });
  expect(cidade).not.toBe('Outra cidade');

  // o link público da demo é modo teste: o orçamento não vira lead real
  const reais = () =>
    noBanco(async (sql) => {
      const [r] = await sql<{ n: number }[]>`select count(*)::int as n from public.leads l
        join public.empresas e on e.id = l.empresa_id where e.eh_demo and not l.eh_teste`;
      return r!.n;
    });
  const leadsAntes = await reais();
  const visitante = await context.browser()!.newPage();
  await visitante.goto(`/b/${DEMO}`);
  await expect(visitante.getByRole('heading', { level: 1 })).toBeVisible();
  await visitante.close();
  expect(await reais()).toBe(leadsAntes);

  // a landing não contou o botão da demo como "Testar grátis"
  expect(await cliques()).toBe(antes);

  // 2 horas depois (cookie vencido) a próxima tela leva ao cadastro, sem sessão
  await context.clearCookies({ name: 'orkestra_demo' });
  await page.goto('/app/leads');
  await expect(page).toHaveURL(/\/cadastro\?demo=fim$/);
  await expect(page.getByTestId('aviso-demo')).toContainText('terminou');
  await page.goto('/app/leads');
  await expect(page).toHaveURL(/\/login/);
});

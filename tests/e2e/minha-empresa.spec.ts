import { expect, test, type Page } from '@playwright/test';
import { cadastrar, emailUnico, esvaziarCatalogo, sair, semRolagemHorizontal } from './helpers';

/*
 * Minha empresa (Etapa 2). Cada teste cadastra uma empresa nova: os fluxos alteram a
 * configuração e não podem interferir no Buffet Demo nem nos outros testes em paralelo.
 */

const SENHA = 'senha-forte-123';

async function novaEmpresa(page: Page, buffet: string) {
  const email = emailUnico('empresa');
  await cadastrar(page, {
    nome: 'Dona Teste',
    email,
    whatsapp: '34991355450',
    senha: SENHA,
    buffet,
    segmento: 'Buffet infantil',
  });
  await expect(page).toHaveURL(/\/app\/comecar$/);
  // estes testes montam o catálogo do zero
  await esvaziarCatalogo(email);
}

async function esperarToast(page: Page, texto: string) {
  await expect(page.getByTestId('toast').filter({ hasText: texto })).toBeVisible();
}

/** Data civil (yyyy-MM-dd) do próximo dia da semana `dia` (0 = domingo) a partir de +10 dias. */
function proximoDia(dia: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  while (d.getDay() !== dia) d.setDate(d.getDate() + 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function criarEspaco(page: Page) {
  await page.goto('/app/empresa/agenda-config');
  await page.getByRole('button', { name: 'Adicionar espaço' }).click();
  await page.getByLabel('Nome do espaço').fill('Salão');
  await page.getByLabel('Capacidade máxima (convidados)').fill('150');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await esperarToast(page, 'Espaço criado.');
}

async function criarTurno(page: Page, nome: string, dias: string[]) {
  await page.goto('/app/empresa/agenda-config');
  await page.getByRole('button', { name: 'Adicionar turno' }).click();
  await page.getByLabel('Nome do turno').fill(nome);
  await page.getByLabel('Começa às').fill('15:00');
  for (const dia of dias) await page.getByRole('button', { name: dia, exact: true }).click();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await esperarToast(page, 'Turno criado.');
}

async function criarTipoFesta(page: Page) {
  await page.goto('/app/empresa/catalogo');
  await page.getByRole('button', { name: 'Adicionar tipo de festa' }).click();
  await page.getByLabel('Nome do tipo de festa').fill('Aniversário infantil');
  // No catálogo, o único formulário aberto é o do tipo novo.
  await page.getByRole('button', { name: 'Salvar' }).click();
  await esperarToast(page, 'Tipo de festa criado.');
}

async function criarPacotePorFaixa(page: Page, nome: string) {
  await page.goto('/app/empresa/catalogo');
  await page.getByRole('link', { name: 'Novo pacote' }).click();
  await page.getByLabel('Nome do pacote').fill(nome);
  await page.getByRole('button', { name: 'Criar pacote' }).click();
  await expect(page).toHaveURL(/\/app\/empresa\/catalogo\/pacotes\/[0-9a-f-]{36}/);

  const preco = page.locator('#preco');
  await preco.getByLabel(/Por faixa de convidados/).check();
  await preco.getByLabel('Faixa 1: até (convidados)').fill('30');
  await preco.getByLabel('Faixa 1: valor').fill('2.000,00');
  await preco.getByRole('button', { name: 'Adicionar faixa' }).click();
  await preco.getByLabel('Faixa 2: até (convidados)').fill('60');
  await preco.getByLabel('Faixa 2: valor').fill('3.000,00');
  await preco.getByLabel('Cada convidado acima da maior faixa').fill('50,00');
  await preco.getByRole('button', { name: 'Salvar' }).click();
  await esperarToast(page, 'Preço do pacote salvo.');
}

test.describe('minha empresa', () => {
  test('dono edita a identidade e vê a confirmação', async ({ page }) => {
    await novaEmpresa(page, 'Buffet Antigo');
    await page.goto('/app/empresa');
    await expect(page.getByRole('heading', { name: 'Identidade do buffet' })).toBeVisible();

    await page.getByLabel('Nome do buffet').fill('Buffet Renovado');
    await page.getByLabel('Cidade').fill('Uberlândia');
    await page.getByLabel('Sobre o buffet').fill('Festas infantis com muito carinho.');
    await page.locator('#nome').press('Tab');
    await expect(page.getByText('Alterações não salvas')).toBeVisible();
    await page.getByRole('button', { name: 'Salvar' }).first().click();

    await esperarToast(page, 'Identidade salva.');
    await expect(page.getByTestId('nome-buffet')).toHaveText('Buffet Renovado');
    await page.reload();
    await expect(page.getByLabel('Cidade')).toHaveValue('Uberlândia');
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('dono cria pacote por faixa com cardápio e o simulador mostra o preço', async ({ page }) => {
    await novaEmpresa(page, 'Buffet Faixas');
    await criarEspaco(page);
    await criarTurno(page, 'Tarde', [
      'domingo',
      'segunda-feira',
      'terça-feira',
      'quarta-feira',
      'quinta-feira',
      'sexta-feira',
      'sábado',
    ]);
    await criarTipoFesta(page);
    await criarPacotePorFaixa(page, 'Festa Completa');

    const cardapio = page.locator('#cardapio');
    await cardapio.getByRole('button', { name: 'Adicionar seção' }).click();
    await cardapio.getByLabel('Nome da seção 1').fill('Salgados');
    await cardapio.getByRole('textbox', { name: 'Item 1' }).fill('Coxinha');
    await cardapio.getByRole('button', { name: 'Adicionar item' }).click();
    await cardapio.getByRole('textbox', { name: 'Item 2' }).fill('Kibe');
    await cardapio.getByRole('button', { name: 'Salvar' }).click();
    await esperarToast(page, 'Cardápio salvo.');
    expect(await semRolagemHorizontal(page)).toBe(true);

    await page.getByRole('link', { name: 'Testar preços' }).click();
    await expect(page).toHaveURL(/\/app\/empresa\/simulador$/);
    await page.getByLabel('Pacote').selectOption({ label: 'Festa Completa' });
    await page.getByLabel('Adultos').fill('40');
    await page.getByRole('button', { name: 'Calcular preço' }).click();

    // 40 convidados → faixa até 60 (R$ 3.000,00). Empresa nova não tem ajustes por dia.
    await expect(page.getByTestId('total-orcamento')).toContainText('R$ 3.000,00');
    await expect(page.getByRole('list', { name: 'Linhas do orçamento' })).toContainText(
      'faixa até 60',
    );
  });

  test('turno só de sábado faz o simulador recusar uma sexta-feira', async ({ page }) => {
    await novaEmpresa(page, 'Buffet Sábado');
    await criarEspaco(page);
    await criarTurno(page, 'Sábado à tarde', ['sábado']);
    await criarTipoFesta(page);
    await criarPacotePorFaixa(page, 'Pacote Sábado');

    await page.goto('/app/empresa/simulador');
    await page.getByLabel('Data').fill(proximoDia(5));
    await page.getByRole('button', { name: 'Calcular preço' }).click();
    await expect(page.getByText(/não está disponível em sexta/i)).toBeVisible();

    await page.getByLabel('Data').fill(proximoDia(6));
    await page.getByRole('button', { name: 'Calcular preço' }).click();
    await expect(page.getByText('Orçamento válido.')).toBeVisible();
  });

  test('vendedor criado pelo dono troca a senha no 1º acesso e só vê a configuração', async ({
    page,
  }) => {
    await novaEmpresa(page, 'Buffet Equipe');
    await page.goto('/app/empresa/usuarios');
    await page.getByRole('button', { name: 'Novo vendedor' }).click();
    const dialogo = page.getByRole('dialog');
    const emailVendedor = emailUnico('vendedor');
    await dialogo.getByLabel('Nome').fill('Vera Vendas');
    await dialogo.getByLabel('E-mail').fill(emailVendedor);
    await dialogo.getByLabel('WhatsApp').fill('34991355450');
    await dialogo.getByLabel('Limite de desconto').fill('10');
    await dialogo.getByRole('button', { name: 'Criar vendedor' }).click();

    const senhaTemporaria = (await page.getByTestId('senha-temporaria').textContent())!.trim();
    expect(senhaTemporaria).toHaveLength(12);
    await expect(dialogo.getByRole('link', { name: 'Enviar pelo WhatsApp' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/5534991355450\?text=/,
    );
    await dialogo.getByRole('button', { name: 'Concluir' }).click();
    await expect(page.getByTestId('usuario').filter({ hasText: emailVendedor })).toBeVisible();
    await sair(page);

    await page.goto('/login');
    await page.getByLabel('E-mail').fill(emailVendedor);
    await page.getByLabel('Senha', { exact: true }).fill(senhaTemporaria);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/nova-senha$/);
    await expect(page.getByRole('heading', { name: 'Crie sua senha' })).toBeVisible();

    // Enquanto não troca, o painel continua bloqueado.
    await page.goto('/app/empresa/catalogo');
    await expect(page).toHaveURL(/\/nova-senha$/);

    await page.getByLabel('Nova senha', { exact: true }).fill('senha-da-vera-1');
    await page.getByLabel('Confirme a nova senha').fill('senha-da-vera-1');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page).toHaveURL(/\/app\/leads$/);

    await page.goto('/app/empresa/catalogo');
    await expect(page.getByText('modo leitura', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Novo pacote' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Plano' })).toHaveCount(0);

    await page.goto('/app/empresa');
    await expect(page.getByLabel('Nome do buffet')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0);

    await page.goto('/app/empresa/usuarios');
    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
  });

  test('troca do link: o link antigo redireciona para o novo', async ({ page }) => {
    await novaEmpresa(page, 'Buffet Link Velho');
    await page.goto('/app/empresa');
    const linkAntigo = (await page.getByTestId('link-atual').textContent())!.trim();
    const slugAntigo = linkAntigo.split('/b/')[1]!;
    const slugNovo = `link-novo-${Date.now().toString(36)}`;

    await page.getByLabel('Final do link').fill(slugNovo);
    await page.getByRole('button', { name: 'Alterar link' }).click();
    await esperarToast(page, 'O link antigo continua funcionando por 12 meses.');
    await expect(page.getByTestId('link-atual')).toContainText(`/b/${slugNovo}`);

    await page.goto(`/b/${slugAntigo}`);
    await expect(page).toHaveURL(new RegExp(`/b/${slugNovo}$`));
    await expect(page.getByRole('heading', { name: 'Buffet Link Velho' })).toBeVisible();
  });

  test('dono envia o logo (precisa do Storage)', async ({ page }) => {
    test.skip(!process.env.E2E_STORAGE, 'Storage do Supabase só roda no CI.');
    await novaEmpresa(page, 'Buffet Logo');
    await page.goto('/app/empresa');
    // PNG 1×1: o navegador converte para WEBP antes de enviar.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    await page
      .getByLabel('Escolher Logo')
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
    await esperarToast(page, 'Logo atualizada.');
    await expect(page.getByRole('img', { name: 'Logo' })).toBeVisible();
  });
});

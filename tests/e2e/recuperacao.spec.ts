import { expect, test } from '@playwright/test';
import { cadastrar, emailUnico, entrar, sair } from './helpers';

/** Caixa de e-mails de teste do Supabase local (Mailpit). */
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

async function mailpitDisponivel(): Promise<boolean> {
  try {
    return (await fetch(`${MAILPIT}/api/v1/messages?limit=1`)).ok;
  } catch {
    return false;
  }
}

async function linkDoEmail(para: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const busca = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${para}"`)}`,
        ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
        const id = busca.messages[0]?.ID;
        if (!id) return undefined;
        const msg = await fetch(`${MAILPIT}/api/v1/message/${id}`).then(
          (r) => r.json() as Promise<{ HTML: string }>,
        );
        link = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(msg.HTML)?.[1]?.replaceAll('&amp;', '&');
        return link;
      },
      { timeout: 20_000, message: 'e-mail de recuperação não chegou' },
    )
    .toBeTruthy();
  return link!;
}

test('recuperar senha por e-mail e entrar com a nova senha', async ({ page }) => {
  test.skip(!(await mailpitDisponivel()), 'Mailpit indisponível (rode `pnpm db:start`).');

  const email = emailUnico('recuperacao');
  await cadastrar(page, {
    nome: 'Bruno Lima',
    email,
    whatsapp: '11987654321',
    senha: 'senha-antiga-123',
    buffet: 'Buffet Recupera',
    segmento: 'Buffet em domicílio',
  });
  await expect(page).toHaveURL(/\/app\/comecar$/);
  await page.goto('/app/leads');
  await sair(page);

  await page.goto('/recuperar-senha');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByTestId('aviso-form')).toContainText('enviamos um link');

  const link = await linkDoEmail(email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/nova-senha$/);

  await page.getByLabel('Nova senha', { exact: true }).fill('senha-nova-456');
  await page.getByLabel('Confirme a nova senha').fill('senha-nova-456');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page).toHaveURL(/\/app\/leads$/);

  await sair(page);
  await entrar(page, email, 'senha-nova-456');
});

test('link de recuperação inválido volta com aviso', async ({ page }) => {
  await page.goto('/auth/confirm?token_hash=invalido&type=recovery&next=/nova-senha');
  await expect(page).toHaveURL(/\/recuperar-senha\?erro=link-invalido$/);
  await expect(page.getByTestId('aviso-form')).toContainText('expirou');
});

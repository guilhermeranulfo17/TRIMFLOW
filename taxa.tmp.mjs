import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[375, 812], [1440, 900]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.goto('http://localhost:3000/login');
  await p.getByLabel('E-mail').fill('dono@demo.local');
  await p.getByLabel('Senha', { exact: true }).fill('demo12345');
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.waitForURL(/\/app\/leads/);
  let ok = 0, okLeads = 0;
  for (let i = 0; i < 5; i++) {
    await p.goto('http://localhost:3000/app/numeros?periodo=90d'); await p.waitForTimeout(1200);
    await p.getByTestId('periodo-7d').click();
    if (await p.waitForURL(/periodo=7d/, { timeout: 4000 }).then(() => true, () => false)) ok++;
    await p.goto('http://localhost:3000/app/leads'); await p.waitForTimeout(1200);
    await p.locator('a[href*="/app/leads?ver="]').first().click();
    if (await p.waitForURL(/ver=/, { timeout: 4000 }).then(() => true, () => false)) okLeads++;
  }
  console.log(`${w}px: numeros ${ok}/5, leads ${okLeads}/5`);
  await p.context().close();
}
await b.close();

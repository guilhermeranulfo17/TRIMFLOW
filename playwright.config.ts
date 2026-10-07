import { defineConfig, devices } from '@playwright/test';

const PORTA = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORTA}`;
const CI = !!process.env.CI;

/**
 * E2E contra o app real + Supabase local (`pnpm db:start`).
 * No CI o app é buildado antes e servido com `next start`; localmente usa `next dev`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Permite usar um Chromium já instalado na máquina (ex.: ambientes sem download).
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  projects: [
    {
      name: 'celular',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: /(navegacao|acesso|landing|funil)\.spec\.ts/,
    },
  ],
  webServer: [
    // API falsa do Asaas (Etapa 9A): o app aponta para ela com ASAAS_API_URL e ela devolve o
    // webhook de pagamento para o app.
    {
      command: 'node --no-warnings tests/support/asaas-fake-servidor.mjs',
      url: 'http://localhost:4010/saude',
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        APP_URL: BASE_URL,
        ASAAS_API_KEY: process.env.ASAAS_API_KEY ?? 'chave-falsa',
        ASAAS_WEBHOOK_TOKEN: process.env.ASAAS_WEBHOOK_TOKEN ?? 'token-falso',
      },
    },
    ...(process.env.E2E_BASE_URL
      ? []
      : [
          {
            command: CI ? `pnpm start --port ${PORTA}` : `pnpm dev --port ${PORTA}`,
            url: `${BASE_URL}/login`,
            reuseExistingServer: !CI,
            timeout: 180_000,
            // e-mails (código do contrato, Etapa 10) vão para a API falsa, não para o Resend
            env: {
              RESEND_API_KEY: process.env.RESEND_API_KEY ?? 're_falso_e2e',
              EMAIL_REMETENTE: process.env.EMAIL_REMETENTE ?? 'Orkestra <avisos@orkestra.test>',
              RESEND_API_URL: process.env.RESEND_API_URL ?? 'http://localhost:4010/resend/emails',
              // chave do CPF do contrato (só de teste; em produção vem da Vercel)
              CONTRATOS_CHAVE:
                process.env.CONTRATOS_CHAVE ?? 'ZTJlLW9ya2VzdHJhLWNvbnRyYXRvcy1jaGF2ZS0zMmI=',
            },
          },
        ]),
  ],
});

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
      testMatch: /navegacao\.spec\.ts/,
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: CI ? `pnpm start --port ${PORTA}` : `pnpm dev --port ${PORTA}`,
        url: `${BASE_URL}/login`,
        reuseExistingServer: !CI,
        timeout: 180_000,
      },
});

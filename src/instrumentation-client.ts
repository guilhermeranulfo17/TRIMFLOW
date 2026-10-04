import { opcoesSentry, sentryLigado } from '@/lib/sentry';

/*
 * Zod sem JIT no navegador (Etapa 9B, B.2): o Zod 4 testa `Function("")` para compilar
 * validadores e, com a CSP sem 'unsafe-eval', isso vira uma violação em cada página. O Zod lê a
 * configuração deste global (zod/v4/core); ligar aqui, antes do app, evita importar o Zod.
 */
const global = globalThis as { __zod_globalConfig?: Record<string, unknown> };
global.__zod_globalConfig = { ...global.__zod_globalConfig, jitless: true };

/*
 * Navegador (Etapa 9B, B.3): Sentry só em produção e com NEXT_PUBLIC_SENTRY_DSN. Importado sob
 * demanda para não pesar no carregamento das páginas (os primeiros instantes ficam sem captura).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (sentryLigado(dsn)) {
  void import('@sentry/nextjs').then((Sentry) => Sentry.init(opcoesSentry(dsn)));
}

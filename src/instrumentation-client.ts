import { opcoesSentry, sentryLigado } from '@/lib/sentry';

/*
 * Navegador (Etapa 9B, B.3): Sentry só em produção e com NEXT_PUBLIC_SENTRY_DSN. Importado sob
 * demanda para não pesar no carregamento das páginas (os primeiros instantes ficam sem captura).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (sentryLigado(dsn)) {
  void import('@sentry/nextjs').then((Sentry) => Sentry.init(opcoesSentry(dsn)));
}

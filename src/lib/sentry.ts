import { limparBreadcrumb, limparEvento } from '@/domain/observabilidade/sentry';

/*
 * Opções do Sentry (Etapa 9B, B.3), iguais no servidor e no navegador. Só em produção e só com o
 * DSN: sem ele nada é carregado nem enviado. Amostragem de desempenho baixa (5%), sem replay,
 * sem dados pessoais (sendDefaultPii falso + limpeza no beforeSend).
 */
export function opcoesSentry(dsn: string | undefined) {
  return {
    dsn,
    enabled: !!dsn && process.env.NODE_ENV === 'production',
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? 'production',
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
    beforeSend: limparEvento,
    beforeSendTransaction: limparEvento,
    beforeBreadcrumb: limparBreadcrumb,
  };
}

/** Liga o Sentry só em produção com DSN (sem isso o pacote nem é baixado). */
export function sentryLigado(dsn: string | undefined): dsn is string {
  return !!dsn && process.env.NODE_ENV === 'production';
}

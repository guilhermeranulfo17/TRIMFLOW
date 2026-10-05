import { opcoesSentry, sentryLigado } from '@/lib/sentry';

/*
 * Parte da instrumentação que só roda no Node (importada pelo ramo `nodejs` de
 * src/instrumentation.ts). Fica num arquivo próprio para o Sentry não entrar no bundle do Edge
 * (middleware).
 */

export async function registrarNode() {
  // Sentry no servidor (Etapa 9B, B.3): só em produção e com SENTRY_DSN
  if (sentryLigado(process.env.SENTRY_DSN)) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init(opcoesSentry(process.env.SENTRY_DSN));
  }
  const { ipHashSalt, cronSecret, configVapid, configWhatsapp, configEmail, chaveContratos } =
    await import('./server/env');
  ipHashSalt();
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
      console.error(
        '[site] NEXT_PUBLIC_SITE_URL ausente: links de e-mail, WhatsApp, PDF e QR saem com localhost.',
      );
    }
    if (!cronSecret()) {
      console.warn(
        '[avisos] CRON_SECRET ausente: a fila de avisos não roda pelo job (só pelo after()).',
      );
    }
    if (!configVapid()) {
      console.warn('[avisos] chaves VAPID ausentes: o push no celular fica desligado.');
    }
    if (!configWhatsapp()) {
      console.info('[avisos] WhatsApp não configurado: canal desligado.');
    }
    if (!configEmail()) {
      console.warn('[avisos] RESEND_API_KEY ou EMAIL_REMETENTE ausente: e-mails desligados.');
    }
    if (!chaveContratos()) {
      console.error(
        '[contratos] CONTRATOS_CHAVE ausente ou inválida: o cliente não consegue assinar contratos.',
      );
    }
    if (!process.env.SENTRY_DSN) {
      console.info('[observabilidade] SENTRY_DSN ausente: erros só no log da Vercel.');
    }
  }
}

export async function erroDaRequisicao(...args: unknown[]) {
  if (!sentryLigado(process.env.SENTRY_DSN)) return;
  const Sentry = await import('@sentry/nextjs');
  (Sentry.captureRequestError as (...a: unknown[]) => void)(...args);
}

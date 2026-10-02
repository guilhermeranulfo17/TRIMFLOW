/**
 * Roda uma vez quando o servidor sobe. Falha cedo se faltar configuração obrigatória em
 * produção (melhor do que descobrir no primeiro cliente do link público). Avisos: faltar
 * CRON_SECRET ou VAPID só desliga o canal correspondente, com um aviso no log.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ipHashSalt, cronSecret, configVapid, configWhatsapp } = await import('./server/env');
    ipHashSalt();
    if (process.env.NODE_ENV === 'production') {
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
    }
  }
}

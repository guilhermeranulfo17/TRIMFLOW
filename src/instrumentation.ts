/**
 * Roda uma vez quando o servidor sobe. Falha cedo se faltar configuração obrigatória em
 * produção (melhor do que descobrir no primeiro cliente do link público). Avisos: faltar
 * CRON_SECRET ou VAPID só desliga o canal correspondente, com um aviso no log. Sentry só no
 * Node (o ramo abaixo some do bundle do Edge).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registrarNode } = await import('./instrumentation-node');
    await registrarNode();
  }
}

/** Erros de páginas, rotas e server actions vão ao Sentry (já limpos pelo beforeSend). */
export async function onRequestError(...args: unknown[]) {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { erroDaRequisicao } = await import('./instrumentation-node');
    await erroDaRequisicao(...args);
  }
}

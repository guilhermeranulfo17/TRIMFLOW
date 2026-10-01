/**
 * Roda uma vez quando o servidor sobe. Falha cedo se faltar configuração obrigatória em
 * produção (melhor do que descobrir no primeiro cliente do link público).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ipHashSalt } = await import('./server/env');
    ipHashSalt();
  }
}

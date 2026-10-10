/*
 * Domínio próprio (Etapa 9B, B.6). O endereço antigo da Vercel continua no ar só para redirecionar:
 * 308 (mantém o método) para o mesmo caminho e query no domínio de NEXT_PUBLIC_SITE_URL.
 * As rotas /api/ ficam de fora: webhook do Asaas e chamadas do pg_cron não seguem redirecionamento
 * em POST, e continuam funcionando no endereço antigo até serem trocadas (docs/LANCAMENTO.md).
 */

/**
 * Domínios que redirecionam para o atual: o endereço antigo da Vercel e o domínio próprio sem
 * "www" (o site é https://www.sistemaorkestra.com.br).
 */
export const DOMINIOS_ANTIGOS = ['trimflow-tau.vercel.app', 'sistemaorkestra.com.br'] as const;

/**
 * URL de destino do redirecionamento, ou null se a requisição já está no domínio certo (ou o site
 * ainda não tem domínio novo configurado, ou é uma rota de API).
 */
export function redirecionamentoDeDominio(
  host: string | null | undefined,
  url: { pathname: string; search: string },
  site: string | null | undefined,
  antigos: readonly string[] = DOMINIOS_ANTIGOS,
): string | null {
  if (!host || !site) return null;
  const hostLimpo = host.toLowerCase().replace(/:\d+$/, '');
  if (!antigos.includes(hostLimpo)) return null;
  let destino: URL;
  try {
    destino = new URL(site);
  } catch {
    return null;
  }
  if (destino.hostname.toLowerCase() === hostLimpo) return null;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;
  return `${destino.origin}${url.pathname}${url.search}`;
}

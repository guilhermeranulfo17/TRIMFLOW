import 'server-only';
import { notFound, permanentRedirect } from 'next/navigation';
import { carregarBuffet, carregarSlugAtual, type BuffetPublico } from '@/server/publico/carregar';

/**
 * Buffet do slug ou 404. Link antigo ainda válido (troca de slug há menos de 12 meses) → 308
 * para o mesmo caminho no slug atual.
 */
export async function exigirBuffet(slug: string, sufixo = ''): Promise<BuffetPublico> {
  const buffet = await carregarBuffet(slug);
  if (buffet) return buffet;
  const atual = await carregarSlugAtual(slug);
  if (atual) permanentRedirect(`/b/${atual}${sufixo}`);
  notFound();
}

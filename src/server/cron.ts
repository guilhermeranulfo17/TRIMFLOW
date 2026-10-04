import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { cronSecret } from '@/server/env';
import { dentroDoLimite } from '@/server/seguranca/limite';

/**
 * Rotas chamadas pelo pg_cron ("Authorization: Bearer <CRON_SECRET>"). Comparação em tempo
 * constante; quem erra o segredo 20 vezes na hora fica bloqueado (B.2), mesmo acertando depois.
 */
export function segredoConfere(cabecalho: string | null, esperado: string | null): boolean {
  if (!esperado) return false;
  const a = Buffer.from(cabecalho ?? '');
  const b = Buffer.from(`Bearer ${esperado}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function autorizadoPorCron(req: Request): Promise<boolean> {
  if (!(await dentroDoLimite('cron', { registrar: false }))) return false;
  if (segredoConfere(req.headers.get('authorization'), cronSecret())) return true;
  await dentroDoLimite('cron');
  return false;
}

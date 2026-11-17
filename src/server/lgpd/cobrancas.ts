import 'server-only';
import { and, eq, ne } from 'drizzle-orm';
import { cancelarAssinatura, type DepsCobranca, type Resultado } from '@/server/cobranca/fluxos';
import { moduloAssinaturas } from '@/server/db/schema';
import { cancelarModulo } from '@/server/modulos/fluxos';

/**
 * Pedido de exclusão da conta (LGPD): nada de cobrança nova depois dele. Cancela no Asaas a
 * assinatura do plano e, desde a análise de 17/11/2026 (§99), também a de cada solução contratada
 * (cada módulo mensal é uma assinatura própria; antes ela continuava cobrando depois da exclusão).
 * Se o Asaas recusar alguma, devolve o erro e o pedido não é registrado.
 */
export async function cancelarCobrancasDaConta(
  d: DepsCobranca,
  e: { empresaId: string; usuarioId: string },
): Promise<Resultado> {
  const base = await cancelarAssinatura(d, {
    empresaId: e.empresaId,
    usuarioId: e.usuarioId,
    motivo: 'outro',
    texto: 'Exclusão da conta (LGPD)',
  });
  if (!base.ok && base.erro !== 'Não há assinatura para cancelar.') return base;
  const vivas = await d.db
    .select({ modulo: moduloAssinaturas.modulo })
    .from(moduloAssinaturas)
    .where(
      and(eq(moduloAssinaturas.empresaId, e.empresaId), ne(moduloAssinaturas.status, 'cancelada')),
    );
  for (const v of vivas) {
    const r = await cancelarModulo(d, {
      empresaId: e.empresaId,
      usuarioId: e.usuarioId,
      codigo: v.modulo,
    });
    if (!r.ok) return r;
  }
  return { ok: true };
}

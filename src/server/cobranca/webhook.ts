import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import type { Db } from '@/server/db/client';
import { processarWebhook } from './fluxos';

/*
 * Webhook do Asaas, separado da rota para testar sem o Next. Token no header
 * asaas-access-token (comparação de tempo constante), corpo até 64 KB, JSON válido.
 * Resposta rápida: o efeito roda numa transação só (cobranca_registrar_evento). Erro de banco
 * = 500, e o Asaas reenvia (o evento não ficou gravado). Log só com códigos.
 */

export const TAMANHO_MAXIMO = 64 * 1024;

export function tokenConfere(
  recebido: string | null,
  esperado: string | null | undefined,
): boolean {
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type RespostaWebhook = { status: number; corpo: Record<string, unknown> };

export async function tratarWebhook(
  db: Db,
  o: { token: string | null; tokenEsperado: string | null | undefined; corpo: string },
): Promise<RespostaWebhook> {
  if (!tokenConfere(o.token, o.tokenEsperado)) return { status: 401, corpo: { ok: false } };
  if (Buffer.byteLength(o.corpo) > TAMANHO_MAXIMO) return { status: 413, corpo: { ok: false } };
  let json: unknown;
  try {
    json = JSON.parse(o.corpo);
  } catch {
    return { status: 400, corpo: { ok: false } };
  }
  try {
    const resultado = await processarWebhook(db, json);
    if (resultado === null) return { status: 400, corpo: { ok: false } };
    return { status: 200, corpo: { ok: true, resultado } };
  } catch (erro) {
    console.error('[cobranca] webhook', (erro as { code?: string }).code ?? 'ERRO');
    return { status: 500, corpo: { ok: false } };
  }
}

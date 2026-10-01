import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { ipHashSalt } from '@/server/env';

/** IP do visitante (a Vercel sobrescreve x-forwarded-for com o IP real do cliente). */
async function ipDoVisitante(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'desconhecido';
}

/** sha256(ip + IP_HASH_SALT). O IP nunca é salvo nem logado. */
export function hashIp(ip: string): string {
  return createHash('sha256')
    .update(ip + ipHashSalt())
    .digest('hex');
}

export async function hashIpDoVisitante(): Promise<string> {
  return hashIp(await ipDoVisitante());
}

function assinatura(valor: string): string {
  return createHmac('sha256', `${ipHashSalt()}:formulario`).update(valor).digest('base64url');
}

/** Instante assinado (o formulário do WhatsApp recebe ao aparecer). */
export function assinarInstante(agoraMs: number = Date.now()): string {
  const valor = String(agoraMs);
  return `${valor}.${assinatura(valor)}`;
}

/** Milissegundos desde o instante assinado, ou null se a assinatura não confere. */
export function tempoDesde(token: string | undefined, agoraMs: number = Date.now()): number | null {
  if (!token) return null;
  const [valor, sig] = token.split('.');
  if (!valor || !sig || !/^\d{10,16}$/.test(valor)) return null;
  const esperada = Buffer.from(assinatura(valor));
  const recebida = Buffer.from(sig);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  return agoraMs - Number(valor);
}

/** Tempo mínimo entre o formulário aparecer e ser enviado (robôs enviam na hora). */
export const TEMPO_MINIMO_MS = 2_500;
/** Um formulário aberto há mais de 1 dia é pedido de novo. */
export const TEMPO_MAXIMO_MS = 24 * 60 * 60 * 1000;

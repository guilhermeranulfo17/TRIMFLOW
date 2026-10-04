import 'server-only';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { comAnon as comAnonPadrao } from '@/server/db/anon';
import { ipHashSalt } from '@/server/env';
import type { ComAnon } from '@/server/publico/carregar';
import { hashIp, ipDoVisitante } from '@/server/publico/seguranca';

/*
 * Limite de tentativas próprio (Etapa 9B, B.2) por hash de IP e de e-mail, em
 * publico.limite_acesso (mesma técnica do link público). Se o banco falhar, deixa passar: o
 * Supabase Auth tem os limites dele e o login não pode cair junto.
 */

export type AcaoLimitada = 'login' | 'cadastro' | 'recuperar_senha' | 'webhook' | 'cron';

export const MENSAGEM_LIMITE =
  'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';

export function hashEmail(email: string): string {
  return createHash('sha256')
    .update(`email:${email.trim().toLowerCase()}:${ipHashSalt()}`)
    .digest('hex');
}

/**
 * IP da própria máquina (testes locais e E2E no CI) não entra no limite. Na Vercel o IP vem sempre
 * do x-forwarded-for, que a plataforma sobrescreve com o IP real: ninguém de fora cai aqui.
 */
export function ipLocal(ip: string): boolean {
  return (
    ip === 'desconhecido' || ip === '::1' || ip.startsWith('127.') || ip === '::ffff:127.0.0.1'
  );
}

/** true = pode seguir. `registrar: false` só confere (webhook e cron contam só as recusadas). */
export async function dentroDoLimite(
  acao: AcaoLimitada,
  opcoes: { email?: string; registrar?: boolean; ipHash?: string } = {},
  comAnon: ComAnon = comAnonPadrao,
): Promise<boolean> {
  try {
    let ip = opcoes.ipHash;
    if (!ip) {
      const bruto = await ipDoVisitante();
      if (ipLocal(bruto)) return true;
      ip = hashIp(bruto);
    }
    const email = opcoes.email ? hashEmail(opcoes.email) : null;
    const [linha] = await comAnon((tx) =>
      tx.execute<{ ok: boolean }>(
        sql`select publico.limite_acesso(${acao}, ${ip}, ${email}, ${opcoes.registrar ?? true}) as ok`,
      ),
    );
    return linha?.ok !== false;
  } catch {
    return true;
  }
}

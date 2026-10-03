import { createHmac, timingSafeEqual } from 'node:crypto';

/*
 * Cookie da sessão de suporte ("Entrar como esta empresa"): empresa, dono, admin e validade,
 * assinado com HMAC-SHA256. Só vale junto com a sessão do próprio admin (mesmo id, na lista,
 * com MFA) e com o consentimento do dono ainda vigente no banco (conferidos a cada request).
 */

export const COOKIE_SUPORTE = 'orkestra_suporte';
/** A sessão de suporte dura no máximo 2 horas (e nunca passa do fim do consentimento). */
export const DURACAO_SUPORTE_MS = 2 * 60 * 60 * 1000;

export type SessaoSuporte = {
  empresaId: string;
  donoId: string;
  adminId: string;
  adminEmail: string;
  /** epoch em ms */
  exp: number;
};

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function assinarSuporte(s: SessaoSuporte, chave: Buffer): string {
  const corpo = b64(JSON.stringify(s));
  const assinatura = b64(createHmac('sha256', chave).update(corpo).digest());
  return `${corpo}.${assinatura}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Cookie válido (assinatura e validade) → sessão; qualquer coisa estranha → null. */
export function lerSuporte(
  valor: string | undefined | null,
  chave: Buffer,
  agora = Date.now(),
): SessaoSuporte | null {
  if (!valor || valor.length > 2000) return null;
  const [corpo, assinatura, extra] = valor.split('.');
  if (!corpo || !assinatura || extra !== undefined) return null;
  const esperada = createHmac('sha256', chave).update(corpo).digest();
  const recebida = Buffer.from(assinatura, 'base64url');
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;
  try {
    const s = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as SessaoSuporte;
    if (
      typeof s.exp !== 'number' ||
      s.exp <= agora ||
      s.exp > agora + DURACAO_SUPORTE_MS + 60_000 ||
      ![s.empresaId, s.donoId, s.adminId].every((x) => typeof x === 'string' && UUID.test(x)) ||
      typeof s.adminEmail !== 'string'
    ) {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** Validade da sessão de suporte: 2 horas ou o fim do consentimento, o que vier antes. */
export const fimDaSessaoSuporte = (agora: number, consentimentoAte: number): number =>
  Math.min(agora + DURACAO_SUPORTE_MS, consentimentoAte);

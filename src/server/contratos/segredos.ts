import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { chaveContratos, ipHashSalt } from '@/server/env';

/*
 * Segredos do contrato (Etapa 10):
 *  - link: token aleatório de 256 bits (43 caracteres base64url); o banco guarda só o sha256;
 *  - código por e-mail: 6 dígitos; o banco guarda só um hash ligado ao contrato e ao sal;
 *  - CPF: AES-256-GCM com CONTRATOS_CHAVE, ligado ao hash do contrato (AAD). Formato
 *    "v1:" + base64url(iv 12 bytes + tag 16 bytes + texto cifrado).
 */

export class ContratosSemChaveError extends Error {
  constructor() {
    super('CONTRATOS_CHAVE ausente ou inválida.');
  }
}

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

export const REGEX_TOKEN_CONTRATO = /^[A-Za-z0-9_-]{43}$/;

export function gerarTokenContrato(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

export function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Hash do código, ligado ao contrato (hash do texto) e ao sal do servidor. */
export function hashCodigo(codigo: string, hashContrato: string): string {
  return sha256(`codigo:${hashContrato}:${codigo.replace(/\D/g, '')}:${ipHashSalt()}`);
}

function chave(): Buffer {
  const c = chaveContratos();
  if (!c) throw new ContratosSemChaveError();
  return c;
}

export function cifrarCpf(cpf: string, hashContrato: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chave(), iv);
  cifra.setAAD(Buffer.from(hashContrato, 'utf8'));
  const corpo = Buffer.concat([cifra.update(cpf, 'utf8'), cifra.final()]);
  return `v1:${Buffer.concat([iv, cifra.getAuthTag(), corpo]).toString('base64url')}`;
}

/** CPF decifrado, ou null se o texto não abrir com a chave atual (alterado ou chave errada). */
export function decifrarCpf(cifrado: string, hashContrato: string): string | null {
  if (!cifrado.startsWith('v1:')) return null;
  try {
    const bruto = Buffer.from(cifrado.slice(3), 'base64url');
    const decifra = createDecipheriv('aes-256-gcm', chave(), bruto.subarray(0, 12));
    decifra.setAAD(Buffer.from(hashContrato, 'utf8'));
    decifra.setAuthTag(bruto.subarray(12, 28));
    return Buffer.concat([decifra.update(bruto.subarray(28)), decifra.final()]).toString('utf8');
  } catch (erro) {
    if (erro instanceof ContratosSemChaveError) throw erro;
    return null;
  }
}

/** Comparação de tempo constante entre dois hashes hex do mesmo tamanho. */
export function hashesIguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

import { createHmac } from 'node:crypto';

/** Código TOTP (RFC 6238: SHA-1, 6 dígitos, 30 s) a partir do segredo em base32. */
export function codigoTotp(segredoBase32: string, agora = Date.now()): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of segredoBase32.replace(/=+$/, '').toUpperCase()) {
    const v = alfabeto.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(agora / 30_000)));
  const h = createHmac('sha1', bytes).update(contador).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, '0');
}

import { createHash } from 'node:crypto';

/*
 * "Impressão digital" do contrato: SHA-256 do texto final, em hexadecimal. O banco calcula a
 * mesma coisa ao gravar (encode(sha256(convert_to(texto, 'UTF8')), 'hex')), com teste de
 * equivalência: mudou uma, mude a outra. O texto é normalizado ANTES de gravar, então o que está
 * no banco é exatamente o que entrou no hash e o PDF mostra o hash que confere.
 */

/** Unicode NFC, quebras de linha \n, sem espaço no fim das linhas, no máximo 1 linha em branco. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '  ')
    .split('\n')
    .map((l) => l.replace(/\s+$/u, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hashTexto(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

/** O texto guardado ainda é o que foi assinado? */
export function conferirIntegridade(texto: string, hash: string): boolean {
  return /^[0-9a-f]{64}$/.test(hash) && hashTexto(texto) === hash;
}

/** "3F9A 0C21 … " em blocos de 4 para caber no comprovante e ser lido em voz alta. */
export function hashEmBlocos(hash: string): string {
  return (hash.toUpperCase().match(/.{1,4}/g) ?? []).join(' ');
}

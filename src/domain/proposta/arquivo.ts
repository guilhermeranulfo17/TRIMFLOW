/** Número do orçamento com 4 dígitos: 42 → "0042". */
export function numeroProposta(numero: number): string {
  return String(numero).padStart(4, '0');
}

function semCaracteresProibidos(texto: string): string {
  return texto
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ascii(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '');
}

/**
 * Nome do PDF: "Proposta 0042 - Buffet X - Ana Souza.pdf". O header Content-Disposition leva a
 * versão ASCII em `filename` e a UTF-8 em `filename*` (RFC 6266).
 */
export function arquivoProposta(d: { numero: number; buffet: string; cliente?: string | null }): {
  nome: string;
  contentDisposition: string;
} {
  const partes = [`Proposta ${numeroProposta(d.numero)}`, d.buffet, d.cliente]
    .filter((p): p is string => !!p && !!p.trim())
    .map(semCaracteresProibidos);
  const nome = `${partes.join(' - ').slice(0, 150)}.pdf`;
  const simples = ascii(nome).replace(/"/g, '');
  return {
    nome,
    contentDisposition: `attachment; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
  };
}

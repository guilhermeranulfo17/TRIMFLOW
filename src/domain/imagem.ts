/** Regras das imagens enviadas pelo dono (convertidas para WEBP no navegador). */

export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;
export const QUALIDADE_WEBP = 0.82;
export const MAX_FOTOS_PACOTE = 6;

export const LADO_MAXIMO = { logo: 512, capa: 1920, pacotes: 1600 } as const;
export type TipoImagemUpload = keyof typeof LADO_MAXIMO;

/** Mensagem de erro em português, ou null se o arquivo pode ser enviado. */
export function validarArquivoImagem(tipo: string, tamanhoBytes: number): string | null {
  if (!(TIPOS_ACEITOS as readonly string[]).includes(tipo)) {
    return 'Use uma imagem JPG, PNG ou WEBP.';
  }
  if (tamanhoBytes > TAMANHO_MAXIMO_BYTES) return 'A imagem pode ter no máximo 5 MB.';
  return null;
}

/** Reduz mantendo a proporção para que o maior lado não passe de `ladoMaximo` (nunca amplia). */
export function dimensoesRedimensionadas(
  largura: number,
  altura: number,
  ladoMaximo: number,
): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= ladoMaximo) return { largura, altura };
  const escala = ladoMaximo / maior;
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

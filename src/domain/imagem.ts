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

/*
 * Capa em duas larguras (Etapa 9B, B.0): o envio grava `{uuid}-1920.webp` (o caminho salvo na
 * empresa) e `{uuid}-960.webp` (celular). Capas antigas (`{uuid}.webp`) só têm uma largura.
 */
export const LARGURAS_CAPA = { pequena: 960, grande: 1920 } as const;

export function caminhosDaCapa(empresaId: string, id: string) {
  return {
    grande: `${empresaId}/capa/${id}-${LARGURAS_CAPA.grande}.webp`,
    pequena: `${empresaId}/capa/${id}-${LARGURAS_CAPA.pequena}.webp`,
  };
}

/** Caminho da versão de 960 px de uma capa, ou null se a capa é antiga (uma largura só). */
export function capaPequenaDe(caminho: string | null | undefined): string | null {
  if (!caminho) return null;
  const sufixo = `-${LARGURAS_CAPA.grande}.webp`;
  return caminho.endsWith(sufixo)
    ? `${caminho.slice(0, -sufixo.length)}-${LARGURAS_CAPA.pequena}.webp`
    : null;
}

/** Todos os arquivos de uma capa no Storage (para apagar junto). */
export function arquivosDaCapa(caminho: string | null | undefined): string[] {
  if (!caminho) return [];
  const pequena = capaPequenaDe(caminho);
  return pequena ? [caminho, pequena] : [caminho];
}

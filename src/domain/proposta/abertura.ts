/** Variáveis do texto de abertura da proposta (tipo de festa). */
export const VARIAVEIS_ABERTURA = ['nome', 'data', 'convidados', 'tipo', 'buffet'] as const;
export type VariavelAbertura = (typeof VARIAVEIS_ABERTURA)[number];

/**
 * Preenche {nome}, {data}, {convidados}, {tipo} e {buffet}. Variável desconhecida fica como
 * está; texto vazio vira null (a proposta não mostra a abertura).
 */
export function preencherAbertura(
  texto: string | null | undefined,
  valores: Partial<Record<VariavelAbertura, string>>,
): string | null {
  const t = texto?.trim();
  if (!t) return null;
  return t.replace(/\{(\w+)\}/g, (inteiro, chave: string) => {
    const valor = valores[chave as VariavelAbertura];
    return valor !== undefined ? valor : inteiro;
  });
}

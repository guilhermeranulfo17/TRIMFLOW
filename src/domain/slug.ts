/** Slug público de empresa: minúsculo, a-z0-9 e hífen, de 3 a 60 caracteres. */

export const SLUG_MIN = 3;
export const SLUG_MAX = 60;
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SUBSTITUICOES: Record<string, string> = {
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ß: 'ss',
  đ: 'd',
  ł: 'l',
  þ: 'th',
};

/** gerarSlug("Buffet Alegria & Cia") → "buffet-alegria-cia". Pode retornar string vazia. */
export function gerarSlug(texto: string, max = SLUG_MAX): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[æœøßđłþ]/g, (c) => SUBSTITUICOES[c] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export function slugValido(slug: string): boolean {
  return slug.length >= SLUG_MIN && slug.length <= SLUG_MAX && SLUG_REGEX.test(slug);
}

/**
 * Base do slug de uma empresa a partir do nome. Garante o mínimo de 3 caracteres
 * (nomes muito curtos ganham o prefixo "buffet-"). O sufixo de unicidade é resolvido no banco.
 */
export function slugBaseDaEmpresa(nome: string): string {
  const slug = gerarSlug(nome);
  if (slug.length >= SLUG_MIN) return slug;
  return slug ? `buffet-${slug}` : 'buffet';
}

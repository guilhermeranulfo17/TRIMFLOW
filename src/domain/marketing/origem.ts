/*
 * Origem do cadastro (Etapa 9.6): utm_source, utm_medium, utm_campaign e ref da URL do anúncio,
 * guardados num cookie de 30 dias e gravados em empresas.origem_cadastro quando a conta nasce.
 * Nada pessoal. Espelho do check do banco: public._origem_cadastro_valida.
 */

export const CHAVES_ORIGEM = ['utm_source', 'utm_medium', 'utm_campaign', 'ref'] as const;
export type ChaveOrigem = (typeof CHAVES_ORIGEM)[number];
export type OrigemCadastro = Partial<Record<ChaveOrigem, string>>;

export const COOKIE_ORIGEM = 'orkestra_origem';
export const DIAS_COOKIE_ORIGEM = 30;
const MAX = 60;

/** Minúsculas, sem espaço nas pontas, só [a-z0-9._-] (o resto vira "-"), até 60 caracteres. */
export function limparValorOrigem(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX);
  return limpo || null;
}

type Fonte = { get(nome: string): string | null } | Record<string, unknown>;

const ler = (fonte: Fonte, chave: string): string | null => {
  if (typeof (fonte as { get?: unknown }).get === 'function') {
    return (fonte as { get(n: string): string | null }).get(chave);
  }
  const v = (fonte as Record<string, unknown>)[chave];
  return typeof (Array.isArray(v) ? v[0] : v) === 'string'
    ? ((Array.isArray(v) ? v[0] : v) as string)
    : null;
};

/** Origem a partir da URL (URLSearchParams ou searchParams do Next); null se não houver nada. */
export function origemDaUrl(fonte: Fonte): OrigemCadastro | null {
  const o: OrigemCadastro = {};
  for (const chave of CHAVES_ORIGEM) {
    const v = limparValorOrigem(ler(fonte, chave));
    if (v) o[chave] = v;
  }
  return Object.keys(o).length > 0 ? o : null;
}

/** Último toque: uma origem nova substitui a guardada; visita sem origem não apaga nada. */
export function mesclarOrigem(
  guardada: OrigemCadastro | null,
  nova: OrigemCadastro | null,
): OrigemCadastro | null {
  return nova ?? guardada;
}

export function serializarOrigem(o: OrigemCadastro): string {
  return encodeURIComponent(JSON.stringify(o));
}

/** Lê o valor do cookie; qualquer coisa fora do formato vira null (nunca lança). */
export function lerOrigemDoCookie(valor: string | null | undefined): OrigemCadastro | null {
  if (!valor) return null;
  try {
    const bruto: unknown = JSON.parse(decodeURIComponent(valor));
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
    return origemDaUrl(bruto as Record<string, unknown>);
  } catch {
    return null;
  }
}

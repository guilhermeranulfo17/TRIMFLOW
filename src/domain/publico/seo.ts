/*
 * SEO da vitrine do buffet (/b/slug, §98): título e descrição com a cidade (quem procura buffet
 * procura "buffet infantil em <cidade>") e quais vitrines o Google pode indexar.
 */

type BuffetSeo = {
  nome: string;
  sobre: string | null;
  cidade: string | null;
  uf: string | null;
};

function onde(b: BuffetSeo): string | null {
  const cidade = b.cidade?.trim();
  if (!cidade) return null;
  const uf = b.uf?.trim().toUpperCase();
  return uf ? `${cidade}, ${uf}` : cidade;
}

/** "Buffet Alegria · frase" ou, sem frase, "Buffet Alegria em Uberlândia, MG". */
export function tituloDaVitrine(b: BuffetSeo, slogan: string | null | undefined): string {
  const frase = slogan?.trim();
  if (frase) return `${b.nome} · ${frase}`;
  const lugar = onde(b);
  return lugar ? `${b.nome} em ${lugar}` : b.nome;
}

/** O "sobre" do buffet (até 160 caracteres) ou um convite com a cidade. */
export function descricaoDaVitrine(b: BuffetSeo): string {
  const sobre = b.sobre?.trim().replace(/\s+/g, ' ');
  if (sobre) return sobre.length <= 160 ? sobre : `${sobre.slice(0, 157).trimEnd()}...`;
  const lugar = onde(b);
  return `Monte o orçamento da sua festa no ${b.nome}${lugar ? `, em ${lugar},` : ''} em poucos minutos, pelo celular.`;
}

/**
 * A demonstração da landing e as contas de apresentação (§88) não são buffets de verdade: ficam
 * fora do Google. O resto das vitrines pode ser indexado.
 */
export function vitrineIndexavel(slug: string, slugDemo: string | null): boolean {
  if (slugDemo && slug === slugDemo) return false;
  return !slug.startsWith('apresentacao-');
}

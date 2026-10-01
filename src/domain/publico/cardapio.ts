import type { SecaoCardapioCtx } from '../preco';

/** Resumo do cardápio para o acordeão do pacote: "Salgados, Bebidas e Doces · 24 itens". */
export function resumoCardapio(secoes: Pick<SecaoCardapioCtx, 'nome' | 'itens'>[]): string | null {
  const comItens = secoes.filter((s) => s.itens.length > 0);
  if (comItens.length === 0) return null;
  const nomes = comItens.map((s) => s.nome);
  const lista =
    nomes.length === 1
      ? nomes[0]!
      : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  const total = comItens.reduce((n, s) => n + s.itens.length, 0);
  return `${lista} · ${total} ${total === 1 ? 'item' : 'itens'}`;
}

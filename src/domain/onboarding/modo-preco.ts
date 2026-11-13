import type { ModoPreco } from '../publico/tipos';

/*
 * Como o preço aparece para o cliente no link (regras_comerciais.modo_exibicao_preco), com uma
 * frase simples para o dono escolher no onboarding (Fase 6, item 1).
 */
export const OPCOES_MODO_PRECO: { valor: ModoPreco; titulo: string; frase: string }[] = [
  {
    valor: 'exato',
    titulo: 'Mostrar o preço',
    frase: 'O cliente monta a festa e vê o valor exato na hora. É o que mais gera pedidos.',
  },
  {
    valor: 'faixa',
    titulo: 'Mostrar uma faixa',
    frase: 'O cliente vê um valor aproximado (de tanto a tanto). O valor exato vem na proposta.',
  },
  {
    valor: 'apos_contato',
    titulo: 'Valor após contato',
    frase:
      'O cliente monta a festa e deixa o WhatsApp sem ver preço. Você fala com ele e manda a proposta.',
  },
];

export function modoPrecoValido(v: unknown): v is ModoPreco {
  return OPCOES_MODO_PRECO.some((o) => o.valor === v);
}

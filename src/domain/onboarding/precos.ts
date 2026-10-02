import type { Centavos } from '../money';

/*
 * Passo 3 do onboarding: o dono digita UM valor por pacote. Pacote por faixa: o valor da 1ª
 * faixa; as outras faixas e o excedente saem na proporção do modelo (arredondados) e aparecem
 * para ele conferir e ajustar antes de confirmar. Nada é confirmado sem o dono digitar.
 */

export type FaixaPreco = { ateConvidados: number; valorCentavos: Centavos };

const PASSO_FAIXA = 1000; // R$ 10
const PASSO_EXCEDENTE = 100; // R$ 1

/** Arredonda para o múltiplo mais próximo (meio para cima), nunca abaixo de um múltiplo. */
export function arredondarPara(valor: Centavos, passo: number): Centavos {
  return Math.max(passo, Math.floor(valor / passo + 0.5) * passo);
}

/**
 * Faixas e excedente proporcionais ao modelo, a partir do valor digitado para a 1ª faixa.
 * Faixas a R$ 10, excedente a R$ 1. Só inteiros (centavos); a razão usa números inteiros.
 */
export function faixasProporcionais(
  modelo: FaixaPreco[],
  excedenteModelo: Centavos | null,
  primeiroValor: Centavos,
): { faixas: FaixaPreco[]; excedenteCentavos: Centavos | null } {
  const base = modelo[0]?.valorCentavos ?? 0;
  if (!base || primeiroValor <= 0) {
    return { faixas: modelo.map((f) => ({ ...f })), excedenteCentavos: excedenteModelo };
  }
  const proporcional = (v: Centavos) => Math.floor((v * primeiroValor) / base + 0.5);
  return {
    faixas: modelo.map((f, i) => ({
      ateConvidados: f.ateConvidados,
      valorCentavos:
        i === 0 ? primeiroValor : arredondarPara(proporcional(f.valorCentavos), PASSO_FAIXA),
    })),
    excedenteCentavos:
      excedenteModelo === null
        ? null
        : arredondarPara(proporcional(excedenteModelo), PASSO_EXCEDENTE),
  };
}

export type ErroPreco = 'OBRIGATORIO' | 'MUITO_ALTO' | 'FAIXAS_FORA_DE_ORDEM';

/** Valor digitado (centavos) é aceitável como preço? */
export function validarPreco(valor: Centavos | null): ErroPreco | null {
  if (valor === null || !Number.isInteger(valor) || valor <= 0) return 'OBRIGATORIO';
  if (valor > 100_000_000) return 'MUITO_ALTO';
  return null;
}

/** Faixas com convidados crescentes e todos os valores válidos. */
export function validarFaixas(faixas: FaixaPreco[]): ErroPreco | null {
  if (faixas.length === 0) return 'OBRIGATORIO';
  for (const [i, f] of faixas.entries()) {
    const erro = validarPreco(f.valorCentavos);
    if (erro) return erro;
    if (i > 0 && f.ateConvidados <= faixas[i - 1]!.ateConvidados) return 'FAIXAS_FORA_DE_ORDEM';
  }
  return null;
}

export const MENSAGEM_ERRO_PRECO: Record<ErroPreco, string> = {
  OBRIGATORIO: 'Digite o preço.',
  MUITO_ALTO: 'Valor alto demais. Confira os zeros.',
  FAIXAS_FORA_DE_ORDEM: 'As faixas precisam estar em ordem crescente de convidados.',
};

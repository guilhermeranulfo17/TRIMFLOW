/*
 * Contas fora das métricas (análise de 17/11/2026, §99): demonstração (eh_demo), apresentação
 * (eh_apresentacao) e cortesia (isenta). Somavam 109 de 120 leads e 79 de 92 orçamentos e
 * distorciam o /interno e a análise semanal. Ficam fora por padrão; "Incluir contas de teste"
 * (?teste=1) traz todas. ESPELHO de public._empresa_fora_das_metricas, com teste de equivalência.
 * Os Números de cada buffet (numeros, numeros_contratos, numeros_ocupacao, funil) são da própria
 * empresa e não mudam.
 */

export type MarcasConta = { ehDemo: boolean; ehApresentacao: boolean; isenta: boolean };

export function contaForaDasMetricas(c: MarcasConta): boolean {
  return c.ehDemo || c.ehApresentacao || c.isenta;
}

/** ?teste=1 na URL do /interno inclui as contas de teste. */
export function incluirContasDeTeste(v: string | string[] | undefined | null): boolean {
  return (Array.isArray(v) ? v[0] : v) === '1';
}

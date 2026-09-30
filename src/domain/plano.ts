/** Situação do plano da empresa para a tela Plano (somente leitura nesta etapa). */

export type Plano = 'trial' | 'ativo' | 'suspenso';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias inteiros que faltam para o fim do teste (arredonda para cima; nunca negativo). */
export function diasRestantesTeste(trialAte: Date | null, agora: Date = new Date()): number {
  if (!trialAte) return 0;
  return Math.max(0, Math.ceil((trialAte.getTime() - agora.getTime()) / DIA_MS));
}

export function rotuloPlano(plano: Plano, diasRestantes: number): string {
  if (plano === 'ativo') return 'Assinatura ativa';
  if (plano === 'suspenso') return 'Acesso suspenso';
  if (diasRestantes === 0) return 'Teste grátis encerrado';
  return diasRestantes === 1
    ? 'Teste grátis: falta 1 dia'
    : `Teste grátis: faltam ${diasRestantes} dias`;
}

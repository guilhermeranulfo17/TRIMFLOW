/*
 * Onboarding guiado (/app/comecar): um passo por tela, progresso salvo no servidor
 * (empresas.onboarding_passo). Passar do passo 3 exige um pacote com preço confirmado
 * (a mesma regra é conferida no SQL por avancar_onboarding).
 */

export const PASSOS_ONBOARDING = [
  { numero: 1, chave: 'modelo', titulo: 'Seu catálogo pronto', curto: 'Modelo' },
  { numero: 2, chave: 'identidade', titulo: 'A cara do seu buffet', curto: 'Identidade' },
  { numero: 3, chave: 'precos', titulo: 'Seus preços', curto: 'Preços' },
  { numero: 4, chave: 'agenda', titulo: 'Espaços e horários', curto: 'Agenda' },
  { numero: 5, chave: 'pronto', titulo: 'Seu link está no ar', curto: 'Pronto' },
] as const;

export type PassoOnboarding = (typeof PASSOS_ONBOARDING)[number]['numero'];
export const TOTAL_PASSOS = PASSOS_ONBOARDING.length;

export function passoValido(valor: unknown): PassoOnboarding {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  return (PASSOS_ONBOARDING.find((p) => p.numero === n)?.numero ?? 1) as PassoOnboarding;
}

/** "passo 3 de 5" */
export function textoProgresso(passo: number): string {
  return `passo ${Math.min(Math.max(passo, 1), TOTAL_PASSOS)} de ${TOTAL_PASSOS}`;
}

/** Barra de progresso em % (passo 1 = 20%). */
export function percentualProgresso(passo: number): number {
  return Math.round((Math.min(Math.max(passo, 1), TOTAL_PASSOS) / TOTAL_PASSOS) * 100);
}

/** Pode avançar para `destino`? Depois do passo 3 precisa de preço confirmado. */
export function podeIrPara(destino: number, temPacoteConfirmado: boolean): boolean {
  if (destino < 1 || destino > TOTAL_PASSOS) return false;
  return destino <= 3 || temPacoteConfirmado;
}

/** Duração do onboarding em minutos inteiros (null se não terminou). */
export function minutosDoOnboarding(inicio: Date | null, fim: Date | null): number | null {
  if (!inicio || !fim) return null;
  return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 60_000));
}

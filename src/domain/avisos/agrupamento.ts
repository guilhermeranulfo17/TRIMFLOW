/** Dois avisos do mesmo tipo para o mesmo lead (e destinatário) em 10 min viram um só. */
export const JANELA_AGRUPAMENTO_MIN = 10;

export function deveAgrupar(anteriorCriadoEm: Date | null, agora: Date): boolean {
  if (!anteriorCriadoEm) return false;
  const diff = agora.getTime() - anteriorCriadoEm.getTime();
  return diff >= 0 && diff < JANELA_AGRUPAMENTO_MIN * 60_000;
}

/*
 * Visitas ao link (Etapa 8): user-agent de robô não conta como visita. Lista curta e
 * conservadora (buscadores, prévias de link de redes sociais e ferramentas de linha de comando);
 * o registro já é feito pelo navegador depois de carregar a página, o que tira a maioria dos
 * robôs que não executam JavaScript.
 */
const ROBO =
  /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|telegrambot|embedly|headless|lighthouse|curl\/|wget\/|python-requests|axios\/|node-fetch|go-http-client|java\//i;

export function ehRobo(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length < 10) return true;
  return ROBO.test(userAgent);
}

/*
 * Quem recebe o aviso de um lead: o responsável; sem responsável, os donos. O dono que ligou
 * "receber também os avisos dos leads dos vendedores" recebe junto. ESPELHO de
 * public._aviso_destinatarios (teste de integração).
 */
export type Dono = { id: string; receberDeVendedores: boolean };

export function destinatariosDoLead(responsavelId: string | null, donos: Dono[]): string[] {
  if (!responsavelId) return donos.map((d) => d.id);
  const extras = donos.filter((d) => d.receberDeVendedores && d.id !== responsavelId);
  return [responsavelId, ...extras.map((d) => d.id)];
}

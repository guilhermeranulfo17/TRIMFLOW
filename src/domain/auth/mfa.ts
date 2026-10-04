/**
 * Verificação em duas etapas (Etapa 9B, B.2): o painel exige aal2 de quem ligou o TOTP. A marca
 * `app_metadata.mfa` (gravada só pela Admin API) e o nível `aal` vêm nos claims do JWT.
 */
export function precisaSegundoFator(
  claims: {
    aal?: unknown;
    app_metadata?: unknown;
  } | null,
): boolean {
  if (!claims) return false;
  const app = (claims.app_metadata ?? {}) as Record<string, unknown>;
  return app.mfa === true && claims.aal !== 'aal2';
}

export const DESTINO_PADRAO = '/app/leads';

/** Aceita só caminhos internos ("/app/…"); bloqueia open redirect ("//site", "https://…"). */
export function destinoSeguro(next: string | null | undefined, padrao = DESTINO_PADRAO): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return padrao;
  }
  return next;
}

export const ROTAS_SO_VISITANTE = ['/login', '/cadastro'] as const;

export function ehRotaProtegida(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/');
}

export function ehRotaSoVisitante(pathname: string): boolean {
  return (ROTAS_SO_VISITANTE as readonly string[]).includes(pathname);
}

/** app_metadata.trocar_senha: marcado ao criar vendedor; só a Admin API altera. */
export function precisaTrocarSenha(appMetadata: Record<string, unknown> | undefined): boolean {
  return appMetadata?.trocar_senha === true;
}

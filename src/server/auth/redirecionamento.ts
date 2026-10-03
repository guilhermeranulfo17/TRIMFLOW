// regra pura em domain/auth/destino (também usada pelo callback do Google)
export { DESTINO_PADRAO, destinoSeguro } from '@/domain/auth/destino';

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

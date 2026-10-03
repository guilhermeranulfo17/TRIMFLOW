/*
 * Para onde vai quem acabou de entrar (Etapa 9.5, login com Google). Regra pura: o callback do
 * OAuth lê o estado do usuário e aplica isto.
 */

export const DESTINO_PADRAO = '/app/leads';

/** Aceita só caminhos internos ("/app/…"); bloqueia open redirect ("//site", "https://…"). */
export function destinoSeguro(next: string | null | undefined, padrao = DESTINO_PADRAO): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return padrao;
  }
  return next;
}

export type EstadoPosLogin = {
  /** existe linha em public.usuarios para este usuário do Auth */
  temUsuario: boolean;
  ativo: boolean;
  /** app_metadata.trocar_senha (vendedor com senha temporária) */
  trocarSenha: boolean;
  /** entrou por um provedor externo (Google): conta como credencial pessoal */
  provedorExterno: boolean;
  next: string | null | undefined;
};

export type DestinoPosLogin =
  | { tipo: 'painel'; url: string; limparTrocarSenha: boolean }
  | { tipo: 'nova-senha'; url: '/nova-senha' }
  | { tipo: 'completar'; url: '/cadastro/completar' }
  | { tipo: 'bloqueado'; url: string };

export function destinoPosLogin(e: EstadoPosLogin): DestinoPosLogin {
  // sem conta no Orkestra: completa o cadastro (empresa, WhatsApp, segmento)
  if (!e.temUsuario) return { tipo: 'completar', url: '/cadastro/completar' };
  // vendedor desativado continua barrado, qualquer que seja o jeito de entrar
  if (!e.ativo) return { tipo: 'bloqueado', url: '/login?erro=sem-acesso' };
  if (e.trocarSenha && !e.provedorExterno) return { tipo: 'nova-senha', url: '/nova-senha' };
  return {
    tipo: 'painel',
    url: destinoSeguro(e.next),
    limparTrocarSenha: e.trocarSenha && e.provedorExterno,
  };
}

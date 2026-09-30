import 'server-only';
import type { Perfil } from '@/server/db/schema';
import { exigirSessao, type UsuarioAtual } from './sessao';

export class AcessoNegadoError extends Error {
  constructor(message = 'Você não tem permissão para fazer isso.') {
    super(message);
    this.name = 'AcessoNegadoError';
  }
}

export function perfilPermitido(perfil: Perfil, permitidos: readonly Perfil[]): boolean {
  return permitidos.includes(perfil);
}

/**
 * Guard de servidor para páginas e server actions que só certos perfis podem usar.
 * Ex.: `const dono = await exigirPerfil('dono')`.
 * O RLS no banco continua sendo a barreira final; este guard dá a resposta amigável antes.
 */
export async function exigirPerfil(...permitidos: [Perfil, ...Perfil[]]): Promise<UsuarioAtual> {
  const usuario = await exigirSessao();
  if (!perfilPermitido(usuario.perfil, permitidos)) throw new AcessoNegadoError();
  return usuario;
}

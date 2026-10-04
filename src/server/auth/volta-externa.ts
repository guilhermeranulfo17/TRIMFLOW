import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { destinoPosLogin } from '@/domain/auth/destino';
import { situacaoParaLogin } from '@/server/db/admin';
import { criarAuthAdmin } from './admin-supabase';
import { precisaTrocarSenha } from './redirecionamento';
import { logar } from '@/server/log';

/*
 * Volta do login por provedor externo (Google, OAuth com PKCE). Dependências injetadas para o
 * teste de integração simular o Supabase e o banco.
 */

export type DepsVoltaExterna = {
  trocarCodigo: (code: string) => Promise<boolean>;
  /** usuário conferido no servidor do Auth (getUser) */
  usuario: () => Promise<{ id: string; app_metadata: Record<string, unknown> } | null>;
  situacao: (id: string) => Promise<{ temUsuario: boolean; ativo: boolean }>;
  limparTrocarSenha: (id: string) => Promise<void>;
  /** renova o JWT (getClaims lê o token: sem isso o flag antigo continua valendo) */
  renovar: () => Promise<void>;
  sair: () => Promise<void>;
};

/** Devolve a URL para onde mandar. Qualquer falha = sessão encerrada e /login?erro=google. */
export async function decidirVoltaExterna(
  deps: DepsVoltaExterna,
  code: string | null,
  next: string | null,
): Promise<string> {
  try {
    if (!code || !(await deps.trocarCodigo(code))) return '/login?erro=google';
    const user = await deps.usuario();
    if (!user) return '/login?erro=google';

    const destino = destinoPosLogin({
      ...(await deps.situacao(user.id)),
      trocarSenha: precisaTrocarSenha(user.app_metadata),
      // esta volta só acontece por provedor externo: conta como credencial pessoal
      provedorExterno: true,
      next,
    });
    if (destino.tipo === 'bloqueado') {
      await deps.sair();
      return destino.url;
    }
    if (destino.tipo === 'painel' && destino.limparTrocarSenha) {
      await deps.limparTrocarSenha(user.id);
      await deps.renovar();
    }
    return destino.url;
  } catch {
    logar('erro', 'auth.volta_externa_falhou');
    await deps.sair().catch(() => undefined);
    return '/login?erro=google';
  }
}

export function depsDoSupabase(supabase: SupabaseClient): DepsVoltaExterna {
  return {
    trocarCodigo: async (code) => !(await supabase.auth.exchangeCodeForSession(code)).error,
    usuario: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ? { id: data.user.id, app_metadata: data.user.app_metadata ?? {} } : null;
    },
    situacao: situacaoParaLogin,
    limparTrocarSenha: (id) => criarAuthAdmin().concluirTrocaDeSenha(id),
    renovar: async () => {
      await supabase.auth.refreshSession();
    },
    sair: async () => {
      await supabase.auth.signOut();
    },
  };
}

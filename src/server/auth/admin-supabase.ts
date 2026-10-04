import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/*
 * ACESSO ADMINISTRATIVO AO AUTH (service role).
 * A chave SUPABASE_SERVICE_ROLE_KEY só existe no servidor e só é lida aqui. Este módulo é
 * `server-only` e o ESLint impede que componentes e páginas o importem; quem o usa são as
 * server actions de Usuários (sempre depois de exigirPerfil('dono')).
 */

export type ResultadoCriarUsuario =
  { ok: true; id: string } | { ok: false; motivo: 'email_em_uso' | 'falha' };

/** O mínimo que Usuários precisa da Admin API. Os testes de integração injetam uma versão fake. */
export interface AuthAdmin {
  /** Cria o usuário já confirmado, com a troca de senha obrigatória no primeiro acesso. */
  criarUsuario(dados: {
    email: string;
    senha: string;
    nome: string;
  }): Promise<ResultadoCriarUsuario>;
  apagarUsuario(id: string): Promise<void>;
  /** Bloqueia o login (usuário desativado). */
  banir(id: string): Promise<void>;
  desbanir(id: string): Promise<void>;
  /** Tira a obrigação de trocar a senha (depois que o usuário cria a senha dele). */
  concluirTrocaDeSenha(id: string): Promise<void>;
}

export class AuthAdminNaoConfiguradoError extends Error {
  constructor() {
    super('SUPABASE_SERVICE_ROLE_KEY ausente');
    this.name = 'AuthAdminNaoConfiguradoError';
  }
}

/** Tempo de bloqueio "para sempre" (100 anos), no formato aceito pelo Auth. */
const BANIMENTO = '876000h';

function clienteAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new AuthAdminNaoConfiguradoError();
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function falhar(contexto: string, erro: { message: string } | null) {
  if (erro) throw new Error(`[auth-admin] ${contexto}: ${erro.message}`);
}

export function criarAuthAdmin(): AuthAdmin {
  return {
    async criarUsuario({ email, senha, nome }) {
      const { data, error } = await clienteAdmin().auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome },
        app_metadata: { trocar_senha: true },
      });
      if (error) {
        const codigo = (error as { code?: string }).code;
        if (codigo === 'email_exists' || /already (been )?registered/i.test(error.message))
          return { ok: false, motivo: 'email_em_uso' };
        console.error('[auth-admin] criarUsuario:', error.message);
        return { ok: false, motivo: 'falha' };
      }
      return { ok: true, id: data.user.id };
    },
    async apagarUsuario(id) {
      const { error } = await clienteAdmin().auth.admin.deleteUser(id);
      falhar('apagarUsuario', error);
    },
    async banir(id) {
      const { error } = await clienteAdmin().auth.admin.updateUserById(id, {
        ban_duration: BANIMENTO,
      });
      falhar('banir', error);
    },
    async desbanir(id) {
      const { error } = await clienteAdmin().auth.admin.updateUserById(id, {
        ban_duration: 'none',
      });
      falhar('desbanir', error);
    },
    async concluirTrocaDeSenha(id) {
      const { error } = await clienteAdmin().auth.admin.updateUserById(id, {
        app_metadata: { trocar_senha: false },
      });
      falhar('concluirTrocaDeSenha', error);
    },
  };
}

/**
 * Chave derivada da service role (HMAC-SHA256 com um rótulo), para assinar cookies do servidor
 * (sessão de suporte) sem uma variável nova e sem a chave sair deste módulo.
 */
export async function chaveDerivada(rotulo: string): Promise<Buffer> {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new AuthAdminNaoConfiguradoError();
  const { createHmac } = await import('node:crypto');
  return createHmac('sha256', chave).update(`orkestra:${rotulo}`).digest();
}

/** Storage com a service role (exclusão definitiva da conta, LGPD). Só o que o fluxo precisa. */
export interface StorageAdmin {
  /** Todos os caminhos de arquivos do bucket sob o prefixo (busca recursiva nas pastas). */
  listar(bucket: string, prefixo: string): Promise<string[]>;
  remover(bucket: string, caminhos: string[]): Promise<void>;
}

export function criarStorageAdmin(): StorageAdmin {
  return {
    async listar(bucket, prefixo) {
      const storage = clienteAdmin().storage.from(bucket);
      const achados: string[] = [];
      const pastas = [prefixo.replace(/\/+$/, '')];
      while (pastas.length) {
        const pasta = pastas.pop()!;
        for (let pagina = 0; ; pagina++) {
          const { data, error } = await storage.list(pasta, { limit: 1000, offset: pagina * 1000 });
          falhar('listar', error);
          for (const item of data ?? []) {
            const caminho = `${pasta}/${item.name}`;
            // pasta: sem id (o Storage devolve só o nome)
            if (item.id === null) pastas.push(caminho);
            else achados.push(caminho);
          }
          if (!data || data.length < 1000) break;
        }
      }
      return achados;
    },
    async remover(bucket, caminhos) {
      for (let i = 0; i < caminhos.length; i += 100) {
        const { error } = await clienteAdmin()
          .storage.from(bucket)
          .remove(caminhos.slice(i, i + 100));
        falhar('remover', error);
      }
    },
  };
}

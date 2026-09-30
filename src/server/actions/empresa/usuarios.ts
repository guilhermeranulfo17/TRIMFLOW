'use server';

import { revalidatePath } from 'next/cache';
import {
  limiteDescontoSchema,
  novoVendedorSchema,
  type NovoVendedorEntrada,
} from '@/domain/validacao/usuario';
import { AuthAdminNaoConfiguradoError, criarAuthAdmin } from '@/server/auth/admin-supabase';
import { obterDb } from '@/server/db/client';
import { comUsuario } from '@/server/db/tenant';
import {
  alterarAtivo,
  alterarLimiteDesconto,
  criarVendedor,
  type DepsUsuarios,
  type ResultadoAlterarUsuario,
} from '@/server/usuarios/gerenciar';
import { acaoDoDono, idValido, NAO_ENCONTRADO, validar, type ResultadoAcao } from './comum';

function deps(): DepsUsuarios {
  return { db: obterDb(), comUsuario, auth: criarAuthAdmin() };
}

const SEM_CONFIGURACAO =
  'O cadastro de usuários ainda não está ativo neste servidor. Fale com o suporte do Orkestra.';

/** A Admin API sem a chave de serviço vira uma mensagem simples, sem detalhe técnico. */
async function comAuthAdmin<T>(fn: () => Promise<ResultadoAcao<T>>): Promise<ResultadoAcao<T>> {
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof AuthAdminNaoConfiguradoError) {
      console.error('[usuarios] SUPABASE_SERVICE_ROLE_KEY não configurada');
      return { ok: false, erro: SEM_CONFIGURACAO };
    }
    throw erro;
  }
}

function mensagemAlteracao(r: ResultadoAlterarUsuario, sucesso: string): ResultadoAcao {
  if (r === 'ok') return { ok: true, mensagem: sucesso };
  if (r === 'proprio_usuario') return { ok: false, erro: 'Você não pode desativar a si mesmo.' };
  return { ok: false, erro: NAO_ENCONTRADO };
}

export async function criarNovoVendedor(
  entrada: NovoVendedorEntrada,
): Promise<ResultadoAcao<{ senha: string; email: string }>> {
  return acaoDoDono<{ senha: string; email: string }>((dono) =>
    comAuthAdmin<{ senha: string; email: string }>(async () => {
      const v = validar(novoVendedorSchema, entrada);
      if (!v.ok) return v.resultado;
      const r = await criarVendedor(deps(), dono, v.dados);
      if (!r.ok) {
        if (r.motivo === 'email_em_uso')
          return {
            ok: false,
            erro: 'Já existe uma conta com esse e-mail.',
            campos: { email: 'Já existe uma conta com esse e-mail.' },
          };
        return { ok: false, erro: 'Não foi possível criar o vendedor agora. Tente de novo.' };
      }
      revalidatePath('/app/empresa/usuarios');
      return {
        ok: true,
        mensagem: 'Vendedor criado.',
        dados: { senha: r.senha, email: v.dados.email },
      };
    }),
  );
}

export async function definirAtivoUsuario(
  usuarioId: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  return acaoDoDono((dono) =>
    comAuthAdmin(async () => {
      if (!idValido(usuarioId)) return { ok: false, erro: NAO_ENCONTRADO };
      const r = await alterarAtivo(deps(), dono, usuarioId, !!ativo);
      revalidatePath('/app/empresa/usuarios');
      return mensagemAlteracao(r, ativo ? 'Usuário reativado.' : 'Usuário desativado.');
    }),
  );
}

export async function salvarLimiteDesconto(
  usuarioId: string,
  limiteDescontoBp: number,
): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    if (!idValido(usuarioId)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(limiteDescontoSchema, { limiteDescontoBp });
    if (!v.ok) return v.resultado;
    const r = await alterarLimiteDesconto(deps(), dono, usuarioId, v.dados.limiteDescontoBp);
    revalidatePath('/app/empresa/usuarios');
    return mensagemAlteracao(r, 'Limite de desconto salvo.');
  });
}

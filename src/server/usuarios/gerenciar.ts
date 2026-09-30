import 'server-only';
import { randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { celularBRParaE164 } from '@/domain/phone';
import { gerarSenhaTemporaria } from '@/domain/senha';
import type { NovoVendedorSaida } from '@/domain/validacao/usuario';
import type { AuthAdmin } from '@/server/auth/admin-supabase';
import type { UsuarioAtual } from '@/server/auth/sessao';
import type { Db } from '@/server/db/client';
import { auditoria, usuarios } from '@/server/db/schema';
import type { Tx } from '@/server/db/tenant';

/*
 * Regras de Usuários com as dependências injetadas (banco e Admin API do Auth), para os testes
 * de integração rodarem sem o servidor do Auth. As server actions passam as implementações reais.
 */

export type DepsUsuarios = {
  /** Cliente administrativo (ignora RLS): o painel não tem permissão de inserir em usuarios. */
  db: Db;
  comUsuario: <T>(usuarioId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
  auth: AuthAdmin;
};

export type DonoRef = Pick<UsuarioAtual, 'id'> & { empresa: Pick<UsuarioAtual['empresa'], 'id'> };

export type ResultadoCriarVendedor =
  { ok: true; id: string; senha: string } | { ok: false; motivo: 'email_em_uso' | 'falha' };

/** bp (1% = 100) → numeric(5,2) em texto ("12.50"). */
export function bpParaPct(bp: number): string {
  return (bp / 100).toFixed(2);
}

/**
 * Cria o vendedor nas duas pontas: primeiro no Auth (com a troca de senha obrigatória), depois
 * em `usuarios` + auditoria numa transação. Se o banco falhar, o usuário do Auth é apagado.
 * A senha temporária é devolvida uma única vez e não é gravada em lugar nenhum.
 */
export async function criarVendedor(
  deps: DepsUsuarios,
  dono: DonoRef,
  dados: NovoVendedorSaida,
): Promise<ResultadoCriarVendedor> {
  const senha = gerarSenhaTemporaria(randomInt);
  const criado = await deps.auth.criarUsuario({ email: dados.email, senha, nome: dados.nome });
  if (!criado.ok) return criado;

  try {
    await deps.db.transaction(async (tx) => {
      await tx.insert(usuarios).values({
        id: criado.id,
        empresaId: dono.empresa.id,
        nome: dados.nome,
        email: dados.email,
        whatsappE164: celularBRParaE164(dados.whatsapp),
        perfil: 'vendedor',
        limiteDescontoPct: bpParaPct(dados.limiteDescontoBp),
        ativo: true,
      });
      await tx.insert(auditoria).values({
        empresaId: dono.empresa.id,
        usuarioId: dono.id,
        acao: 'usuario.criado',
        entidade: 'usuario',
        entidadeId: criado.id,
        dados: {
          depois: {
            nome: dados.nome,
            email: dados.email,
            perfil: 'vendedor',
            limiteDescontoBp: dados.limiteDescontoBp,
          },
        },
      });
    });
  } catch (erro) {
    console.error('[usuarios] falha ao gravar vendedor; desfazendo no Auth', erro);
    await deps.auth.apagarUsuario(criado.id).catch((e) => {
      console.error('[usuarios] não foi possível apagar o usuário do Auth', criado.id, e);
    });
    return { ok: false, motivo: 'falha' };
  }
  return { ok: true, id: criado.id, senha };
}

export type ResultadoAlterarUsuario = 'ok' | 'nao_encontrado' | 'proprio_usuario';

/**
 * Desativa (bloqueia o login) ou reativa um usuário da empresa. O banco muda pelo RLS (só o
 * dono pode) e o bloqueio no Auth acontece dentro da mesma transação: se o Auth falhar, nada muda.
 */
export async function alterarAtivo(
  deps: DepsUsuarios,
  dono: DonoRef,
  usuarioId: string,
  ativo: boolean,
): Promise<ResultadoAlterarUsuario> {
  if (usuarioId === dono.id) return 'proprio_usuario';
  return deps.comUsuario(dono.id, async (tx) => {
    const [antes] = await tx
      .select({ ativo: usuarios.ativo })
      .from(usuarios)
      .where(and(eq(usuarios.id, usuarioId), eq(usuarios.empresaId, dono.empresa.id)));
    if (!antes) return 'nao_encontrado';
    const alterados = await tx
      .update(usuarios)
      .set({ ativo })
      .where(eq(usuarios.id, usuarioId))
      .returning({ id: usuarios.id });
    // Sem linha alterada = o RLS barrou (só o dono altera usuários).
    if (alterados.length === 0) return 'nao_encontrado';
    await tx.insert(auditoria).values({
      empresaId: dono.empresa.id,
      usuarioId: dono.id,
      acao: ativo ? 'usuario.reativado' : 'usuario.desativado',
      entidade: 'usuario',
      entidadeId: usuarioId,
      dados: { antes: { ativo: antes.ativo }, depois: { ativo } },
    });
    if (ativo) await deps.auth.desbanir(usuarioId);
    else await deps.auth.banir(usuarioId);
    return 'ok';
  });
}

export async function alterarLimiteDesconto(
  deps: DepsUsuarios,
  dono: DonoRef,
  usuarioId: string,
  limiteDescontoBp: number,
): Promise<ResultadoAlterarUsuario> {
  return deps.comUsuario(dono.id, async (tx) => {
    const [antes] = await tx
      .select({ limite: usuarios.limiteDescontoPct })
      .from(usuarios)
      .where(and(eq(usuarios.id, usuarioId), eq(usuarios.empresaId, dono.empresa.id)));
    if (!antes) return 'nao_encontrado';
    const novo = bpParaPct(limiteDescontoBp);
    const alterados = await tx
      .update(usuarios)
      .set({ limiteDescontoPct: novo })
      .where(eq(usuarios.id, usuarioId))
      .returning({ id: usuarios.id });
    if (alterados.length === 0) return 'nao_encontrado';
    await tx.insert(auditoria).values({
      empresaId: dono.empresa.id,
      usuarioId: dono.id,
      acao: 'usuario.limite_alterado',
      entidade: 'usuario',
      entidadeId: usuarioId,
      dados: { antes: antes.limite, depois: novo },
    });
    return 'ok';
  });
}

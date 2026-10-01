import 'server-only';
import { revalidateTag } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import type { z } from 'zod';
import { idSchema } from '@/domain/validacao/comum';
import { AcessoNegadoError, exigirPerfil } from '@/server/auth/guards';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { auditoria } from '@/server/db/schema';
import type { Tx } from '@/server/db/tenant';
import { tagDoBuffet } from '@/server/publico/cache';

export { tagDoBuffet };

export type ResultadoAcao<T = undefined> =
  | { ok: true; mensagem: string; dados?: T }
  | { ok: false; erro: string; campos?: Record<string, string> };

export const DADOS_INVALIDOS = 'Confira os campos destacados.';

/** Issues do Zod → { "faixas.1.ateConvidados": "mensagem" } (primeira mensagem de cada campo). */
export function errosDoZod(erro: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const issue of erro.issues) {
    const chave = issue.path.join('.') || '_';
    campos[chave] ??= issue.message;
  }
  return campos;
}

/** Valida a entrada; em caso de erro já devolve o resultado com os campos. */
export function validar<S extends z.ZodType>(
  schema: S,
  entrada: unknown,
): { ok: true; dados: z.output<S> } | { ok: false; resultado: ResultadoAcao<never> } {
  const r = schema.safeParse(entrada);
  if (r.success) return { ok: true, dados: r.data };
  return {
    ok: false,
    resultado: { ok: false, erro: DADOS_INVALIDOS, campos: errosDoZod(r.error) },
  };
}

function codigoPostgres(erro: unknown): string | undefined {
  const e = erro as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
}

/** Erro do banco → mensagem simples (nunca a mensagem técnica). */
export function mensagemDeErroBanco(erro: unknown): string {
  switch (codigoPostgres(erro)) {
    case '23505':
      return 'Já existe um cadastro com esses dados. Use outro nome ou valor.';
    case '23P01':
      return 'Há faixas sobrepostas. Confira os valores.';
    case '23503':
      return 'Esse item está ligado a outro cadastro que não existe mais. Recarregue a página.';
    case '23514':
      return 'Algum valor está fora do permitido. Confira os campos.';
    case '42501':
      return 'Você não tem permissão para fazer isso.';
    case '23001':
      return 'Este item já foi usado em orçamentos e não pode ser excluído. Desative-o: ele some do link e as propostas já enviadas continuam iguais.';
    default:
      return 'Não foi possível salvar agora. Tente de novo em instantes.';
  }
}

/**
 * Envolve uma server action de configuração: exige dono, traduz erros e nunca vaza detalhe
 * técnico. Redirecionamentos do Next (sessão expirada) continuam funcionando.
 */
export async function acaoDoDono<T>(
  fn: (dono: UsuarioAtual) => Promise<ResultadoAcao<T>>,
): Promise<ResultadoAcao<T>> {
  try {
    const dono = await exigirPerfil('dono');
    const resultado = await fn(dono);
    // A página pública guarda vitrine e catálogo em cache (tag por slug): toda configuração
    // salva invalida esse cache.
    if (resultado.ok) revalidateTag(tagDoBuffet(dono.empresa.slug));
    return resultado;
  } catch (erro) {
    unstable_rethrow(erro);
    if (erro instanceof AcessoNegadoError) {
      return { ok: false, erro: 'Só o dono do buffet pode alterar a configuração.' };
    }
    console.error('[acaoDoDono]', erro);
    return { ok: false, erro: mensagemDeErroBanco(erro) };
  }
}

/** Grava uma linha de auditoria na mesma transação da alteração. */
export async function auditar(
  tx: Tx,
  dono: UsuarioAtual,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  dados: Record<string, unknown> = {},
) {
  await tx.insert(auditoria).values({
    empresaId: dono.empresa.id,
    usuarioId: dono.id,
    acao,
    entidade,
    entidadeId,
    dados,
  });
}

/** Só as chaves que mudaram, no formato { campo: { antes, depois } }. */
export function diferencas<T extends Record<string, unknown>>(antes: T, depois: Partial<T>) {
  const mudou: Record<string, { antes: unknown; depois: unknown }> = {};
  for (const [chave, valor] of Object.entries(depois)) {
    if (JSON.stringify(antes[chave]) !== JSON.stringify(valor))
      mudou[chave] = { antes: antes[chave], depois: valor };
  }
  return mudou;
}

export const NAO_ENCONTRADO = 'Esse cadastro não existe mais. Recarregue a página.';

/** Id recebido do navegador tem formato de uuid? (evita erro de tipo no banco) */
export function idValido(id: unknown): id is string {
  return typeof id === 'string' && idSchema.safeParse(id).success;
}

'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { documentoValido } from '@/domain/cobranca/documento';
import { CODIGOS_MODULO } from '@/domain/modulos';
import { AcessoNegadoError, exigirPerfil } from '@/server/auth/guards';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { depsCobranca } from '@/server/cobranca/deps';
import { cancelarModulo, contratarModulo, verificarPagamentoModulo } from '@/server/modulos/fluxos';
import { errosDoZod, type ResultadoAcao } from './empresa/comum';
import { codigoDoErro, logar } from '@/server/log';

/*
 * Ações de "Nossas soluções". Contratar, cancelar e pagar: só o dono (o vendedor vê o
 * catálogo, mas o servidor recusa aqui e o banco não deixa escrever). A cobrança roda pela
 * conexão administrativa com auditoria (server/modulos/fluxos).
 */

const SEM_COBRANCA =
  'A contratação pelo painel ainda não está ligada. Fale com a gente no WhatsApp.';
const PADRAO = 'Não foi possível concluir agora. Tente de novo em instantes.';

async function acaoDoDono<T>(
  fn: (dono: UsuarioAtual) => Promise<ResultadoAcao<T>>,
): Promise<ResultadoAcao<T>> {
  try {
    const dono = await exigirPerfil('dono');
    if (dono.empresa.demo) {
      return { ok: false, erro: 'A conta de demonstração não contrata soluções.' };
    }
    const r = await fn(dono);
    if (r.ok) revalidatePath('/app', 'layout');
    return r;
  } catch (erro) {
    unstable_rethrow(erro);
    if (erro instanceof AcessoNegadoError) {
      return { ok: false, erro: 'Só o dono do buffet contrata e cancela soluções.' };
    }
    logar('erro', 'modulos.acao', { codigo: codigoDoErro(erro) });
    return { ok: false, erro: PADRAO };
  }
}

const codigoSchema = z.enum(CODIGOS_MODULO);

const contratarSchema = z.object({
  codigo: codigoSchema,
  reservaId: z.uuid().optional().nullable(),
  /** confirmação explícita do resumo da compra */
  aceite: z.literal(true, 'Confirme que leu o resumo da compra.'),
  dados: z
    .object({
      nome: z.string().trim().min(2, 'Informe o nome de quem paga.').max(120),
      documento: z
        .string()
        .trim()
        .refine(documentoValido, 'CPF ou CNPJ inválido. Confira os números.'),
      email: z.string().trim().email('Informe um e-mail válido.').max(200),
    })
    .optional()
    .nullable(),
});

export type EntradaContratarSolucao = z.input<typeof contratarSchema>;

/** Cria a cobrança da solução e devolve o link da fatura. O acesso só vem com o pagamento. */
export async function contratarSolucao(
  entrada: EntradaContratarSolucao,
): Promise<ResultadoAcao<{ urlFatura: string | null }>> {
  const v = contratarSchema.safeParse(entrada);
  if (!v.success) {
    return { ok: false, erro: 'Confira os campos destacados.', campos: errosDoZod(v.error) };
  }
  return acaoDoDono(async (dono) => {
    const deps = depsCobranca();
    if (!deps) return { ok: false, erro: SEM_COBRANCA };
    const r = await contratarModulo(deps, {
      empresaId: dono.empresa.id,
      usuarioId: dono.id,
      codigo: v.data.codigo,
      reservaId: v.data.reservaId ?? null,
      dados: v.data.dados ?? null,
    });
    if (!r.ok) return { ok: false, erro: r.erro };
    return {
      ok: true,
      mensagem: 'Fatura criada. O acesso é liberado assim que o pagamento for confirmado.',
      dados: r.dados,
    };
  });
}

export async function cancelarSolucao(codigo: string): Promise<ResultadoAcao> {
  const c = codigoSchema.safeParse(codigo);
  if (!c.success) return { ok: false, erro: 'Solução não encontrada.' };
  return acaoDoDono(async (dono) => {
    const deps = depsCobranca();
    if (!deps) return { ok: false, erro: SEM_COBRANCA };
    const r = await cancelarModulo(deps, {
      empresaId: dono.empresa.id,
      usuarioId: dono.id,
      codigo: c.data,
    });
    return r.ok
      ? {
          ok: true,
          mensagem:
            'Assinatura cancelada. Nada mais será cobrado; o acesso segue até o fim do período pago.',
        }
      : { ok: false, erro: r.erro };
  });
}

/** "Já paguei": consulta o provedor (nunca libera sem a confirmação dele). */
export async function verificarPagamentoSolucao(codigo: string): Promise<ResultadoAcao> {
  const c = codigoSchema.safeParse(codigo);
  if (!c.success) return { ok: false, erro: 'Solução não encontrada.' };
  return acaoDoDono(async (dono) => {
    const deps = depsCobranca();
    if (!deps) return { ok: false, erro: SEM_COBRANCA };
    const r = await verificarPagamentoModulo(deps, { empresaId: dono.empresa.id, codigo: c.data });
    return r.ok
      ? { ok: true, mensagem: 'Situação atualizada com o provedor de pagamento.' }
      : { ok: false, erro: r.erro };
  });
}

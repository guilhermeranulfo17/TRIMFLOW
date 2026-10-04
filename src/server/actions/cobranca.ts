'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { documentoValido } from '@/domain/cobranca/documento';
import { VALORES_MOTIVO } from '@/domain/cobranca/motivos-cancelamento';
import { AcessoNegadoError, exigirPerfil } from '@/server/auth/guards';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { depsCobranca } from '@/server/cobranca/deps';
import { assinar, cancelarAssinatura, mudarPlano } from '@/server/cobranca/fluxos';
import { comUsuario } from '@/server/db/tenant';
import { TAG_PLANOS } from '@/server/marketing/cache';
import { sql } from 'drizzle-orm';
import { errosDoZod, type ResultadoAcao } from './empresa/comum';
import { codigoDoErro, logar } from '@/server/log';

/*
 * Ações da tela de Plano (só o dono). Funcionam também com a conta suspensa: pagar e assinar
 * são justamente o caminho de volta. A cobrança roda pela conexão administrativa com auditoria
 * (server/cobranca/fluxos); o consentimento do suporte, pelas funções SQL do dono.
 */

const SEM_COBRANCA =
  'A assinatura pelo painel ainda não está ligada. Fale com a gente no WhatsApp para assinar.';
const PADRAO = 'Não foi possível concluir agora. Tente de novo em instantes.';

async function acaoDaCobranca<T>(
  fn: (dono: UsuarioAtual) => Promise<ResultadoAcao<T>>,
): Promise<ResultadoAcao<T>> {
  try {
    const dono = await exigirPerfil('dono');
    const r = await fn(dono);
    if (r.ok) revalidatePath('/app', 'layout');
    return r;
  } catch (erro) {
    unstable_rethrow(erro);
    if (erro instanceof AcessoNegadoError) {
      return { ok: false, erro: 'Só o dono do buffet cuida do plano.' };
    }
    logar('erro', 'cobranca.acao', { codigo: codigoDoErro(erro) });
    return { ok: false, erro: PADRAO };
  }
}

const planoSchema = z.enum(['essencial', 'profissional']);
const cicloSchema = z.enum(['mensal', 'anual']);

const assinarSchema = z.object({
  plano: planoSchema,
  ciclo: cicloSchema,
  cupom: z.string().trim().max(30).optional().nullable(),
  nome: z.string().trim().min(2, 'Informe o nome de quem paga.').max(120),
  documento: z.string().trim().refine(documentoValido, 'CPF ou CNPJ inválido. Confira os números.'),
  email: z.string().trim().email('Informe um e-mail válido.').max(200),
});

export type EntradaAssinatura = z.input<typeof assinarSchema>;

/** Cria a assinatura e devolve o link da fatura (Pix, boleto ou cartão no Asaas). */
export async function assinarPlano(
  entrada: EntradaAssinatura,
): Promise<ResultadoAcao<{ urlFatura: string | null }>> {
  return acaoDaCobranca(async (dono) => {
    const v = assinarSchema.safeParse(entrada);
    if (!v.success) {
      return { ok: false, erro: 'Confira os campos destacados.', campos: errosDoZod(v.error) };
    }
    const deps = depsCobranca();
    if (!deps) return { ok: false, erro: SEM_COBRANCA };
    const r = await assinar(deps, {
      empresaId: dono.empresa.id,
      usuarioId: dono.id,
      plano: v.data.plano,
      ciclo: v.data.ciclo,
      cupom: v.data.cupom,
      dados: { nome: v.data.nome, documento: v.data.documento, email: v.data.email },
    });
    if (!r.ok) {
      return r.codigo === 'CUPOM'
        ? { ok: false, erro: r.erro, campos: { cupom: r.erro } }
        : { ok: false, erro: r.erro };
    }
    // cupom usado: as vagas do FUNDADOR na landing mudaram
    if (v.data.cupom) revalidateTag(TAG_PLANOS);
    return { ok: true, mensagem: 'Assinatura criada. Abrindo a fatura…', dados: r.dados };
  });
}

export async function mudarDePlano(entrada: {
  plano: string;
  ciclo: string;
}): Promise<ResultadoAcao> {
  return acaoDaCobranca(async (dono) => {
    const plano = planoSchema.safeParse(entrada.plano);
    const ciclo = cicloSchema.safeParse(entrada.ciclo);
    if (!plano.success || !ciclo.success) return { ok: false, erro: 'Escolha um plano.' };
    const deps = depsCobranca();
    if (!deps) return { ok: false, erro: SEM_COBRANCA };
    const r = await mudarPlano(deps, {
      empresaId: dono.empresa.id,
      usuarioId: dono.id,
      plano: plano.data,
      ciclo: ciclo.data,
    });
    if (!r.ok) return { ok: false, erro: r.erro };
    return {
      ok: true,
      mensagem: 'Plano alterado. O novo valor vale a partir da próxima fatura.',
    };
  });
}

const cancelarSchema = z
  .object({
    motivo: z.enum(VALORES_MOTIVO, { message: 'Conte por que está cancelando.' }),
    texto: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((d) => d.motivo !== 'outro' || (d.texto?.length ?? 0) >= 3, {
    message: 'Conte o motivo em poucas palavras.',
    path: ['texto'],
  });

export async function cancelarPlano(entrada: {
  motivo: string;
  texto?: string | null;
}): Promise<ResultadoAcao> {
  return acaoDaCobranca(async (dono) => {
    const v = cancelarSchema.safeParse(entrada);
    if (!v.success) {
      return { ok: false, erro: 'Confira os campos destacados.', campos: errosDoZod(v.error) };
    }
    const deps = depsCobranca();
    if (!deps) return { ok: false, erro: SEM_COBRANCA };
    const r = await cancelarAssinatura(deps, {
      empresaId: dono.empresa.id,
      usuarioId: dono.id,
      motivo: v.data.motivo,
      texto: v.data.texto || null,
    });
    if (!r.ok) return { ok: false, erro: r.erro };
    return {
      ok: true,
      mensagem: 'Assinatura cancelada. Você usa normalmente até o fim do período pago.',
    };
  });
}

/** Consentimento de 7 dias para o suporte do Orkestra entrar na conta (revogável). */
export async function definirAcessoSuporte(permitir: boolean): Promise<ResultadoAcao> {
  return acaoDaCobranca(async (dono) => {
    await comUsuario(dono.id, (tx) =>
      permitir
        ? tx.execute(sql`select public.permitir_suporte()`)
        : tx.execute(sql`select public.revogar_suporte()`),
    );
    revalidatePath('/app/empresa/plano');
    return {
      ok: true,
      mensagem: permitir
        ? 'O suporte pode acessar sua conta pelos próximos 7 dias.'
        : 'Acesso do suporte removido.',
    };
  });
}

'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { FORMAS_PAGAMENTO, MENSAGEM_ERRO_PLANO, validarPlano } from '@/domain/financeiro';
import { comUsuario } from '@/server/db/tenant';
import { acaoDoDono, idValido, validar, type ResultadoAcao } from './empresa/comum';

/*
 * Financeiro da festa (Etapa 11): plano de pagamento, recebimentos e estorno. Só o dono; o
 * banco confere de novo (reserva confirmada, valores, data, conta suspensa e demo).
 */

const MENSAGENS: Record<string, string> = {
  FINANCEIRO_SO_DONO: 'Só o dono do buffet mexe no financeiro.',
  FINANCEIRO_RESERVA_NAO_ENCONTRADA: 'Esta festa não existe mais. Recarregue a página.',
  FINANCEIRO_RESERVA_NAO_CONFIRMADA: 'Confirme a reserva na Agenda antes de lançar pagamentos.',
  FINANCEIRO_PLANO_INVALIDO: 'Confira as parcelas do plano.',
  FINANCEIRO_RECEBIMENTO_INVALIDO: 'Confira o valor, a data (não pode ser no futuro) e a forma.',
  FINANCEIRO_RECEBIMENTO_NAO_ENCONTRADO: 'Este pagamento não existe mais. Recarregue a página.',
};

async function comMensagem<T>(fn: () => Promise<ResultadoAcao<T>>): Promise<ResultadoAcao<T>> {
  try {
    return await fn();
  } catch (erro) {
    const e = erro as { message?: string; cause?: { message?: string } } | null;
    const m = MENSAGENS[e?.cause?.message ?? e?.message ?? ''];
    if (m) return { ok: false, erro: m };
    throw erro;
  }
}

function revalidar(reservaId: string) {
  revalidatePath('/app/financeiro', 'layout');
  revalidatePath(`/app/financeiro/${reservaId}`);
  revalidatePath('/app/leads', 'layout');
}

const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

const planoSchema = z.object({
  reservaId: z.uuid(),
  parcelas: z
    .array(
      z.object({
        descricao: z.string().trim().min(1).max(80),
        valorCentavos: z.number().int().positive().max(100_000_000),
        venceEm: dataCivil,
      }),
    )
    .min(1)
    .max(24),
});

export async function salvarPlanoPagamento(entrada: unknown): Promise<ResultadoAcao> {
  const v = validar(planoSchema, entrada);
  if (!v.ok) return v.resultado;
  const erro = validarPlano(v.dados.parcelas);
  if (erro) return { ok: false, erro: MENSAGEM_ERRO_PLANO[erro] };
  const p = v.dados.parcelas.map((x) => ({
    descricao: x.descricao,
    valor_centavos: x.valorCentavos,
    vence_em: x.venceEm,
  }));
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      await comUsuario(dono.id, (tx) =>
        tx.execute(
          sql`select public.salvar_plano_pagamento(${v.dados.reservaId}::uuid, ${JSON.stringify(p)}::jsonb)`,
        ),
      );
      revalidar(v.dados.reservaId);
      return { ok: true, mensagem: 'Plano de pagamento salvo.' };
    }),
  );
}

const recebimentoSchema = z.object({
  reservaId: z.uuid(),
  valorCentavos: z.number().int().positive('Informe o valor.').max(100_000_000),
  recebidoEm: dataCivil,
  forma: z.enum(FORMAS_PAGAMENTO),
  observacao: z.string().trim().max(200).optional(),
});

export async function registrarRecebimento(entrada: unknown): Promise<ResultadoAcao> {
  const v = validar(recebimentoSchema, entrada);
  if (!v.ok) return v.resultado;
  const d = v.dados;
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      await comUsuario(dono.id, (tx) =>
        tx.execute(
          sql`select public.registrar_recebimento(${d.reservaId}::uuid, ${d.valorCentavos}::integer,
            ${d.recebidoEm}::date, ${d.forma}, ${d.observacao || null})`,
        ),
      );
      revalidar(d.reservaId);
      return { ok: true, mensagem: 'Pagamento registrado.' };
    }),
  );
}

export async function estornarRecebimento(
  id: string,
  reservaId: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!idValido(id) || !idValido(reservaId)) {
    return { ok: false, erro: MENSAGENS.FINANCEIRO_RECEBIMENTO_NAO_ENCONTRADO! };
  }
  const m = String(motivo ?? '')
    .trim()
    .slice(0, 200);
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      await comUsuario(dono.id, (tx) =>
        tx.execute(sql`select public.estornar_recebimento(${id}::uuid, ${m || null})`),
      );
      revalidar(reservaId);
      return { ok: true, mensagem: 'Pagamento estornado. Ele continua no histórico, riscado.' };
    }),
  );
}

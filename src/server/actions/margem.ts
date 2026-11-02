'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { CATEGORIAS_CUSTO } from '@/domain/modulos';
import { comUsuario } from '@/server/db/tenant';
import { acaoDoDono, validar, type ResultadoAcao } from './empresa/comum';

/*
 * OrkMargem: custos dos pacotes e das festas, fechar e reabrir. Só o dono; o banco confere de
 * novo (módulo vigente, festa confirmada e aberta, conta suspensa e demo) e grava auditoria.
 */

const MENSAGENS: Record<string, string> = {
  MARGEM_SO_DONO: 'Só o dono do buffet vê e registra custos.',
  MODULO_INATIVO:
    'O OrkMargem não está ativo. Seu histórico continua visível; para registrar, ative a solução em Nossas soluções.',
  MARGEM_PACOTE_NAO_ENCONTRADO: 'Este pacote não existe mais. Recarregue a página.',
  MARGEM_DADOS_INVALIDOS: 'Confira os valores.',
  MARGEM_FESTA_NAO_PREPARADA: 'Copie a previsão para a festa antes de registrar custos.',
  MARGEM_FESTA_FECHADA: 'Esta festa está fechada. Reabra para alterar.',
  MARGEM_JA_PREPARADA: 'A previsão desta festa já foi copiada.',
  MARGEM_COM_REALIZADO:
    'Já há custo realizado nesta festa: ajuste os itens em vez de copiar a previsão de novo.',
  MARGEM_CUSTOS_PENDENTES: 'Registre o valor realizado de todos os custos antes de fechar.',
  MARGEM_MOTIVO_OBRIGATORIO: 'Conte em poucas palavras por que a festa será reaberta.',
  MARGEM_FESTA_NAO_FECHADA: 'Esta festa não está fechada.',
  FINANCEIRO_RESERVA_NAO_ENCONTRADA: 'Esta festa não existe mais. Recarregue a página.',
  FINANCEIRO_RESERVA_NAO_CONFIRMADA: 'Confirme a reserva na Agenda antes de registrar custos.',
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

function revalidar(reservaId?: string) {
  revalidatePath('/app/margem', 'layout');
  if (reservaId) revalidatePath(`/app/financeiro/${reservaId}`);
}

const centavos = z.number().int().min(0).max(100_000_000);
const categoria = z.enum(CATEGORIAS_CUSTO);

const custosPacoteSchema = z.object({
  pacoteId: z.uuid(),
  custos: z
    .array(
      z.object({
        categoria,
        fixoCentavos: centavos,
        porConvidadoCentavos: z.number().int().min(0).max(10_000_000),
      }),
    )
    .max(8),
});

export async function salvarCustosPacote(entrada: unknown): Promise<ResultadoAcao> {
  const v = validar(custosPacoteSchema, entrada);
  if (!v.ok) return v.resultado;
  const p = v.dados.custos.map((c) => ({
    categoria: c.categoria,
    fixo_centavos: c.fixoCentavos,
    por_convidado_centavos: c.porConvidadoCentavos,
  }));
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      await comUsuario(dono.id, (tx) =>
        tx.execute(
          sql`select public.margem_salvar_custos_pacote(${v.dados.pacoteId}::uuid, ${JSON.stringify(p)}::jsonb)`,
        ),
      );
      revalidar();
      return { ok: true, mensagem: 'Custos previstos do pacote salvos.' };
    }),
  );
}

const prepararSchema = z.object({
  reservaId: z.uuid(),
  pacoteId: z.uuid().nullable().optional(),
  substituir: z.boolean().optional(),
});

export async function prepararFesta(entrada: unknown): Promise<ResultadoAcao> {
  const v = validar(prepararSchema, entrada);
  if (!v.ok) return v.resultado;
  const d = v.dados;
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      await comUsuario(dono.id, (tx) =>
        tx.execute(
          sql`select public.margem_preparar_festa(${d.reservaId}::uuid, ${d.pacoteId ?? null}::uuid,
            ${d.substituir ?? false})`,
        ),
      );
      revalidar(d.reservaId);
      return { ok: true, mensagem: 'Previsão copiada para a festa.' };
    }),
  );
}

const custosFestaSchema = z.object({
  reservaId: z.uuid(),
  itens: z
    .array(
      z.object({
        categoria,
        descricao: z.string().trim().min(1, 'Descreva o custo.').max(80),
        previstoCentavos: centavos,
        realizadoCentavos: centavos.nullable(),
      }),
    )
    .max(40),
});

export async function salvarCustosFesta(entrada: unknown): Promise<ResultadoAcao> {
  const v = validar(custosFestaSchema, entrada);
  if (!v.ok) return v.resultado;
  const p = v.dados.itens.map((i) => ({
    categoria: i.categoria,
    descricao: i.descricao,
    previsto_centavos: i.previstoCentavos,
    realizado_centavos: i.realizadoCentavos,
  }));
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      await comUsuario(dono.id, (tx) =>
        tx.execute(
          sql`select public.margem_salvar_custos_festa(${v.dados.reservaId}::uuid, ${JSON.stringify(p)}::jsonb)`,
        ),
      );
      revalidar(v.dados.reservaId);
      return { ok: true, mensagem: 'Custos da festa salvos.' };
    }),
  );
}

export async function fecharFesta(reservaId: string): Promise<ResultadoAcao> {
  const v = validar(z.uuid(), reservaId);
  if (!v.ok) return v.resultado;
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      await comUsuario(dono.id, (tx) =>
        tx.execute(sql`select public.margem_fechar_festa(${v.dados}::uuid)`),
      );
      revalidar(v.dados);
      return { ok: true, mensagem: 'Festa fechada. Os valores ficam travados.' };
    }),
  );
}

const reabrirSchema = z.object({
  reservaId: z.uuid(),
  motivo: z.string().trim().min(3, 'Conte o motivo.').max(200),
});

export async function reabrirFesta(entrada: unknown): Promise<ResultadoAcao> {
  const v = validar(reabrirSchema, entrada);
  if (!v.ok) return v.resultado;
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      await comUsuario(dono.id, (tx) =>
        tx.execute(
          sql`select public.margem_reabrir_festa(${v.dados.reservaId}::uuid, ${v.dados.motivo})`,
        ),
      );
      revalidar(v.dados.reservaId);
      return { ok: true, mensagem: 'Festa reaberta. O motivo ficou no histórico.' };
    }),
  );
}

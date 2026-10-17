'use server';

import { eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { formatPhoneBR } from '@/domain/phone';
import { lerCsvLeads } from '@/domain/vendas/csv';
import { leadVendasSchema, type LeadVendasEntrada } from '@/domain/vendas/lead';
import { obterDb } from '@/server/db/client';
import { vendasLeads, vendasMovimentos } from '@/server/db/schema';
import { exigirAdmin, type AdminAtual } from '@/server/interno/guard';
import { codigoDoErro, logar } from '@/server/log';

/*
 * Ações do Vendas Orkestra (Etapa 14, §77). Toda ação exige admin com MFA, valida com o schema
 * do domínio e grava em auditoria_interna só ids (nunca nome ou telefone do lead).
 */

export type ResultadoVendas<T = undefined> =
  | { ok: true; mensagem: string; dados?: T }
  | { ok: false; erro: string; campos?: Record<string, string> };

const PADRAO = 'Não foi possível concluir agora.';
const TELEFONE_REPETIDO = 'Já existe um lead com esse telefone.';
const uuid = z.uuid();

function camposDoZod(erro: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const i of erro.issues) campos[i.path.join('.') || '_'] ??= i.message;
  return campos;
}

function telefoneRepetido(erro: unknown): boolean {
  const e = erro as { code?: string; cause?: { code?: string } } | null;
  return (e?.code ?? e?.cause?.code) === '23505';
}

async function acaoVendas<T>(
  evento: string,
  fn: (admin: AdminAtual) => Promise<ResultadoVendas<T>>,
): Promise<ResultadoVendas<T>> {
  try {
    const admin = await exigirAdmin();
    const r = await fn(admin);
    if (r.ok) revalidatePath('/interno/vendas', 'layout');
    return r;
  } catch (erro) {
    unstable_rethrow(erro);
    if (telefoneRepetido(erro)) {
      return { ok: false, erro: TELEFONE_REPETIDO, campos: { telefone: TELEFONE_REPETIDO } };
    }
    logar('erro', evento, { codigo: codigoDoErro(erro) });
    return { ok: false, erro: PADRAO };
  }
}

const registrar = (admin: AdminAtual, acao: string, dados: Record<string, unknown>) =>
  sql`select public.interno_registrar(${admin.email}, ${acao}, null, ${JSON.stringify(dados)}::jsonb)`;

/** Cadastra um lead à mão: entra em Novo, com o movimento "Cadastro manual". */
export async function criarLeadVendas(
  entrada: LeadVendasEntrada,
): Promise<ResultadoVendas<{ id: string }>> {
  return acaoVendas('vendas.lead_criar', async (admin) => {
    const v = leadVendasSchema.safeParse(entrada);
    if (!v.success)
      return { ok: false, erro: 'Confira os campos destacados.', campos: camposDoZod(v.error) };
    const d = v.data;
    const id = await obterDb().transaction(async (tx) => {
      const [lead] = await tx
        .insert(vendasLeads)
        .values({
          nome: d.nome,
          buffet: d.buffet,
          telefoneE164: d.telefone,
          cidade: d.cidade,
          origem: d.origem,
          resumo: d.resumo,
          proximoFollowup: d.proximoFollowup,
          naoContatar: d.naoContatar,
          naoContatarEm: d.naoContatar ? new Date() : null,
        })
        .returning({ id: vendasLeads.id });
      await tx.insert(vendasMovimentos).values({
        leadId: lead!.id,
        de: null,
        para: 'novo',
        origem: 'manual',
        motivo: 'Cadastro manual',
      });
      await tx.execute(registrar(admin, 'vendas.lead_criado', { lead_id: lead!.id }));
      return lead!.id;
    });
    return { ok: true, mensagem: 'Lead cadastrado.', dados: { id } };
  });
}

/** Edita os dados do lead (etapa e tentativas não mudam aqui). */
export async function atualizarLeadVendas(
  id: string,
  entrada: LeadVendasEntrada,
): Promise<ResultadoVendas> {
  return acaoVendas('vendas.lead_atualizar', async (admin) => {
    if (!uuid.safeParse(id).success) return { ok: false, erro: 'Lead não encontrado.' };
    const v = leadVendasSchema.safeParse(entrada);
    if (!v.success)
      return { ok: false, erro: 'Confira os campos destacados.', campos: camposDoZod(v.error) };
    const d = v.data;
    const atualizou = await obterDb().transaction(async (tx) => {
      const [atual] = await tx
        .select({ naoContatar: vendasLeads.naoContatar })
        .from(vendasLeads)
        .where(eq(vendasLeads.id, id))
        .for('update');
      if (!atual) return false;
      await tx
        .update(vendasLeads)
        .set({
          nome: d.nome,
          buffet: d.buffet,
          telefoneE164: d.telefone,
          cidade: d.cidade,
          origem: d.origem,
          resumo: d.resumo,
          proximoFollowup: d.proximoFollowup,
          naoContatar: d.naoContatar,
          // guarda quando o lead pediu para parar; desmarcar limpa a data
          ...(d.naoContatar !== atual.naoContatar && {
            naoContatarEm: d.naoContatar ? new Date() : null,
          }),
        })
        .where(eq(vendasLeads.id, id));
      await tx.execute(registrar(admin, 'vendas.lead_editado', { lead_id: id }));
      return true;
    });
    if (!atualizou) return { ok: false, erro: 'Lead não encontrado.' };
    return { ok: true, mensagem: 'Lead salvo.' };
  });
}

// ---------------------------------------------------------------------------
// Importação por CSV (passo 4)
// ---------------------------------------------------------------------------

export type LinhaPrevia = {
  linha: number;
  situacao: 'nova' | 'invalida' | 'repetida' | 'ja_cadastrada';
  nome: string;
  buffet: string | null;
  telefone: string | null;
  cidade: string | null;
  erro: string | null;
};

export type PreviaImportacao = { colunas: string[]; linhas: LinhaPrevia[]; novas: number };

const MOTIVO_IMPORTACAO = 'Importação CSV';

/** Lê o CSV no servidor e marca o que já existe no banco (mesmo telefone). */
async function montarPrevia(texto: string): Promise<ResultadoVendas<PreviaImportacao>> {
  const leitura = lerCsvLeads(texto);
  if (!leitura.ok) return { ok: false, erro: leitura.erro };
  const telefones = leitura.linhas.flatMap((l) =>
    l.situacao !== 'invalida' && l.dados.telefone ? [l.dados.telefone] : [],
  );
  const existentes = new Set(
    telefones.length
      ? (
          await obterDb()
            .select({ t: vendasLeads.telefoneE164 })
            .from(vendasLeads)
            .where(inArray(vendasLeads.telefoneE164, telefones))
        ).map((r) => r.t)
      : [],
  );
  const linhas = leitura.linhas.map((l): LinhaPrevia => {
    if (l.situacao === 'invalida') {
      return {
        linha: l.linha,
        situacao: 'invalida',
        nome: l.nome,
        buffet: null,
        telefone: null,
        cidade: null,
        erro: l.erro,
      };
    }
    const d = l.dados;
    const situacao =
      l.situacao === 'repetida'
        ? 'repetida'
        : d.telefone && existentes.has(d.telefone)
          ? 'ja_cadastrada'
          : 'nova';
    return {
      linha: l.linha,
      situacao,
      nome: d.nome,
      buffet: d.buffet,
      telefone: d.telefone ? formatPhoneBR(d.telefone) : null,
      cidade: d.cidade,
      erro: null,
    };
  });
  return {
    ok: true,
    mensagem: '',
    dados: {
      colunas: leitura.colunas,
      linhas,
      novas: linhas.filter((l) => l.situacao === 'nova').length,
    },
  };
}

/** Prévia da importação: nada é gravado. */
export async function previsualizarImportacao(
  texto: string,
): Promise<ResultadoVendas<PreviaImportacao>> {
  return acaoVendas('vendas.importar_previa', async () => montarPrevia(String(texto ?? '')));
}

/**
 * Grava as linhas novas (lê o CSV de novo; nunca confia na prévia do navegador). Telefone que
 * já existe é ignorado também no banco (ON CONFLICT), então duas importações seguidas não
 * duplicam. Cada lead entra em Novo com o movimento "Importação CSV".
 */
export async function importarLeadsVendas(
  texto: string,
): Promise<ResultadoVendas<{ importados: number; ignorados: number }>> {
  return acaoVendas('vendas.importar', async (admin) => {
    const leitura = lerCsvLeads(String(texto ?? ''));
    if (!leitura.ok) return { ok: false, erro: leitura.erro };
    const validas = leitura.linhas.flatMap((l) => (l.situacao === 'ok' ? [l.dados] : []));
    if (validas.length === 0) return { ok: false, erro: 'Nenhuma linha nova para importar.' };
    const importados = await obterDb().transaction(async (tx) => {
      const ids = await tx
        .insert(vendasLeads)
        .values(
          validas.map((d) => ({
            nome: d.nome,
            buffet: d.buffet,
            telefoneE164: d.telefone,
            cidade: d.cidade,
            origem: d.origem,
            resumo: d.resumo,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: vendasLeads.id });
      if (ids.length) {
        await tx.insert(vendasMovimentos).values(
          ids.map(({ id }) => ({
            leadId: id,
            de: null,
            para: 'novo' as const,
            origem: 'importacao' as const,
            motivo: MOTIVO_IMPORTACAO,
          })),
        );
      }
      await tx.execute(registrar(admin, 'vendas.leads_importados', { quantidade: ids.length }));
      return ids.length;
    });
    const ignorados = leitura.linhas.length - importados;
    return {
      ok: true,
      mensagem: importados === 1 ? '1 lead importado.' : `${importados} leads importados.`,
      dados: { importados, ignorados },
    };
  });
}

import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { formatPhoneBR } from '@/domain/phone';
import type { EtapaVendas } from '@/domain/vendas/etapas';
import { normalizarBusca } from '@/domain/vendas/lead';
import { obterDb } from '@/server/db/client';
import { vendasLeads } from '@/server/db/schema';

/*
 * Leituras do Vendas Orkestra (Etapa 14, §77). Conexão administrativa: só depois de
 * exigirAdmin(). Nada aqui toca nas tabelas dos buffets.
 */

export type LeadVendasResumo = {
  id: string;
  nome: string;
  buffet: string | null;
  cidade: string | null;
  telefone: string | null;
  etapa: EtapaVendas;
  proximoFollowup: string | null;
  naoContatar: boolean;
};

export type LeadVendasDetalhe = LeadVendasResumo & {
  telefoneE164: string | null;
  origem: string | null;
  resumo: string | null;
  tentativas: number;
  criadoEm: Date;
  atualizadoEm: Date;
};

/** Limite da lista: a prospecção do Gui tem centenas de leads, não milhares. */
const LIMITE_LISTA = 1000;

/** Lista de leads, mais recentes primeiro; a busca casa nome, buffet, cidade ou telefone. */
export async function listarLeadsVendas(busca: string | null): Promise<LeadVendasResumo[]> {
  const linhas = await obterDb()
    .select()
    .from(vendasLeads)
    .orderBy(desc(vendasLeads.atualizadoEm))
    .limit(LIMITE_LISTA);
  const termo = busca ? normalizarBusca(busca) : '';
  const digitos = termo.replace(/\D/g, '');
  return linhas
    .filter((l) => {
      if (!termo) return true;
      const texto = normalizarBusca([l.nome, l.buffet, l.cidade].filter(Boolean).join(' '));
      return texto.includes(termo) || (digitos.length >= 4 && !!l.telefoneE164?.includes(digitos));
    })
    .map(resumo);
}

export async function carregarLeadVendas(id: string): Promise<LeadVendasDetalhe | null> {
  const [l] = await obterDb().select().from(vendasLeads).where(eq(vendasLeads.id, id)).limit(1);
  if (!l) return null;
  return {
    ...resumo(l),
    telefoneE164: l.telefoneE164,
    origem: l.origem,
    resumo: l.resumo,
    tentativas: l.tentativas,
    criadoEm: l.criadoEm,
    atualizadoEm: l.atualizadoEm,
  };
}

function resumo(l: typeof vendasLeads.$inferSelect): LeadVendasResumo {
  return {
    id: l.id,
    nome: l.nome,
    buffet: l.buffet,
    cidade: l.cidade,
    telefone: l.telefoneE164 ? formatPhoneBR(l.telefoneE164) : null,
    etapa: l.etapa,
    proximoFollowup: l.proximoFollowup,
    naoContatar: l.naoContatar,
  };
}

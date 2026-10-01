import 'server-only';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { hojeNoFuso } from '@/domain/dates';
import { percentualTextoParaBp } from '@/domain/percent';
import type { ContextoPreco, Id } from '@/domain/preco';
import type { TextosComerciais } from '@/domain/proposta';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { carregarContexto } from '@/server/catalogo/carregar';
import { leads, orcamentos, regrasComerciais, tiposEvento, usuarios } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';

/*
 * Leituras do orçamento interno, sempre pelo RLS (dono e vendedor da empresa).
 */

export type BaseInterna = {
  ctx: ContextoPreco;
  textos: TextosComerciais;
  aberturaPorTipo: Record<Id, string | null>;
  limiteDescontoBp: number;
  hoje: string;
};

export async function carregarBaseInterna(usuario: UsuarioAtual): Promise<BaseInterna | null> {
  const [ctx, extras] = await Promise.all([
    carregarContexto(usuario.id),
    comUsuario(usuario.id, async (tx) => {
      const [regras] = await tx.select().from(regrasComerciais).limit(1);
      const tipos = await tx
        .select({ id: tiposEvento.id, texto: tiposEvento.textoAbertura })
        .from(tiposEvento);
      const [u] = await tx
        .select({ limite: usuarios.limiteDescontoPct })
        .from(usuarios)
        .where(eq(usuarios.id, usuario.id));
      return { regras, tipos, limite: u?.limite ?? '0' };
    }),
  ]);
  if (!ctx || !extras.regras) return null;
  const r = extras.regras;
  return {
    ctx,
    textos: {
      condicoes: r.condicoesTexto,
      formasPagamento: r.formasPagamento,
      naoIncluso: r.naoInclusoTexto,
      cancelamento: r.cancelamentoTexto,
      alteracaoConvidados: r.alteracaoConvidadosTexto,
    },
    aberturaPorTipo: Object.fromEntries(extras.tipos.map((t) => [t.id, t.texto])),
    // O dono não tem limite de desconto; o vendedor tem o dele.
    limiteDescontoBp: usuario.perfil === 'dono' ? 10_000 : percentualTextoParaBp(extras.limite),
    hoje: hojeNoFuso(usuario.empresa.fuso),
  };
}

export type LeadPorWhatsapp = { id: string; nome: string; orcamentos: number } | null;

export async function buscarLeadPorWhatsapp(
  usuario: UsuarioAtual,
  whatsappE164: string,
): Promise<LeadPorWhatsapp> {
  return comUsuario(usuario.id, async (tx) => {
    const [l] = await tx
      .select({ id: leads.id, nome: leads.nome })
      .from(leads)
      .where(and(eq(leads.whatsappE164, whatsappE164), eq(leads.ehTeste, false)))
      .limit(1);
    if (!l) return null;
    // conta números (orçamentos), não versões
    const [todos] = await tx
      .select({ n: count() })
      .from(orcamentos)
      .where(and(eq(orcamentos.leadId, l.id), eq(orcamentos.versao, 1)));
    return { id: l.id, nome: l.nome, orcamentos: Number(todos?.n ?? 0) };
  });
}

export type OrcamentoParaEditar = {
  id: string;
  numero: number;
  versao: number;
  status: string;
  rascunho: unknown;
  observacoes: string | null;
  observacoesInternas: string | null;
  descontoMotivo: string | null;
  foraAntecedencia: boolean;
  cliente: { whatsapp: string; nome: string; origem: string; leadId: string };
};

/** Versão vigente de um orçamento (para criar a versão nova a partir dela). */
export async function carregarOrcamentoParaEditar(
  usuario: UsuarioAtual,
  id: string,
): Promise<OrcamentoParaEditar | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return comUsuario(usuario.id, async (tx) => {
    const [base] = await tx.select().from(orcamentos).where(eq(orcamentos.id, id)).limit(1);
    if (!base) return null;
    // sempre a vigente do mesmo número
    const [o] = await tx
      .select()
      .from(orcamentos)
      .where(and(eq(orcamentos.numero, base.numero), eq(orcamentos.empresaId, base.empresaId)))
      .orderBy(desc(orcamentos.versao))
      .limit(1);
    if (!o) return null;
    const [l] = await tx.select().from(leads).where(eq(leads.id, o.leadId)).limit(1);
    if (!l) return null;
    return {
      id: o.id,
      numero: o.numero,
      versao: o.versao,
      status: o.status,
      rascunho: o.rascunho,
      observacoes: o.observacoes,
      observacoesInternas: o.observacoesInternas,
      descontoMotivo: o.descontoMotivo,
      foraAntecedencia: o.foraAntecedencia,
      cliente: { whatsapp: l.whatsappE164, nome: l.nome, origem: l.origem, leadId: l.id },
    };
  });
}

/** Cliente de um lead (atalho "+ Orçamento" no detalhe do lead). */
export async function carregarClienteDoLead(usuario: UsuarioAtual, leadId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return null;
  const [l] = await comUsuario(usuario.id, (tx) =>
    tx
      .select({ whatsapp: leads.whatsappE164, nome: leads.nome, origem: leads.origem })
      .from(leads)
      .where(eq(leads.id, leadId))
      .orderBy(asc(leads.criadoEm))
      .limit(1),
  );
  return l ?? null;
}

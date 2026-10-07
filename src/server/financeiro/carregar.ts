import 'server-only';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { hojeNoFuso, somarDias } from '@/domain/dates';
import {
  noFiltro,
  resumoFinanceiro,
  situacaoFinanceira,
  sugerirPlano,
  type FiltroFinanceiro,
  type FormaPagamento,
  type ParcelaPlano,
  type ResumoFinanceiro,
  type SituacaoFinanceira,
} from '@/domain/financeiro';
import type { UsuarioAtual } from '@/server/auth/sessao';
import {
  leads,
  recebimentos,
  regrasComerciais,
  reservaParcelas,
  reservas,
  tiposEvento,
  usuarios,
} from '@/server/db/schema';
import { naTransacao, type Tx } from '@/server/db/tenant';

/*
 * Leituras do Financeiro (Etapa 11, só o dono): reservas confirmadas, o plano e os
 * recebimentos (RLS do dono). A situação de cada festa sai de domain/financeiro.
 */

const confirmadas = () =>
  and(eq(reservas.tipo, 'confirmada'), inArray(reservas.status, ['ativa', 'realizada']));

export type FestaFinanceiro = {
  reservaId: string;
  leadId: string | null;
  cliente: string;
  data: string;
  tipoEvento: string | null;
  situacao: SituacaoFinanceira;
};

export type TelaFinanceiro = {
  hoje: string;
  filtro: FiltroFinanceiro;
  resumo: ResumoFinanceiro;
  festas: FestaFinanceiro[];
  contagem: Record<FiltroFinanceiro, number>;
};

/**
 * Festas do último ano em diante (e as mais antigas que ainda devem), numa transação: reservas,
 * parcelas e recebimentos em pipeline.
 */
export async function carregarFinanceiro(
  usuario: UsuarioAtual,
  filtro: FiltroFinanceiro,
  tx?: Tx,
): Promise<TelaFinanceiro> {
  const hoje = hojeNoFuso(usuario.empresa.fuso);
  const desde = somarDias(hoje, -365);
  return naTransacao(usuario.id, tx, async (t) => {
    const daJanela = sql`${reservas.id} in (select r.id from public.reservas r
      where r.tipo = 'confirmada' and r.status in ('ativa', 'realizada') and r.data >= ${desde}::date)`;
    const [lista, planos, recs] = await Promise.all([
      t
        .select({
          id: reservas.id,
          leadId: reservas.leadId,
          cliente: reservas.clienteNome,
          leadNome: leads.nome,
          anonimizado: leads.anonimizadoEm,
          data: reservas.data,
          total: reservas.valorTotalCentavos,
          tipoEvento: tiposEvento.nome,
        })
        .from(reservas)
        .leftJoin(leads, eq(leads.id, reservas.leadId))
        .leftJoin(tiposEvento, eq(tiposEvento.id, reservas.tipoEventoId))
        .where(and(confirmadas(), gte(reservas.data, desde)))
        .orderBy(asc(reservas.data)),
      t
        .select({
          reservaId: reservaParcelas.reservaId,
          descricao: reservaParcelas.descricao,
          valorCentavos: reservaParcelas.valorCentavos,
          venceEm: reservaParcelas.venceEm,
        })
        .from(reservaParcelas)
        .innerJoin(reservas, eq(reservas.id, reservaParcelas.reservaId))
        .where(daJanela),
      t
        .select({
          reservaId: recebimentos.reservaId,
          valorCentavos: recebimentos.valorCentavos,
          recebidoEm: recebimentos.recebidoEm,
          estornadoEm: recebimentos.estornadoEm,
        })
        .from(recebimentos)
        .innerJoin(reservas, eq(reservas.id, recebimentos.reservaId))
        .where(daJanela),
    ]);
    const planoDe = new Map<string, ParcelaPlano[]>();
    for (const p of planos) {
      const l = planoDe.get(p.reservaId) ?? [];
      l.push({ descricao: p.descricao, valorCentavos: p.valorCentavos, venceEm: p.venceEm });
      planoDe.set(p.reservaId, l);
    }
    const recDe = new Map<
      string,
      { valorCentavos: number; recebidoEm: string; estornado: boolean }[]
    >();
    for (const r of recs) {
      const l = recDe.get(r.reservaId) ?? [];
      l.push({
        valorCentavos: r.valorCentavos,
        recebidoEm: r.recebidoEm,
        estornado: !!r.estornadoEm,
      });
      recDe.set(r.reservaId, l);
    }
    const todas = lista.map((r) => {
      const rs = recDe.get(r.id) ?? [];
      return {
        festa: {
          reservaId: r.id,
          leadId: r.leadId,
          cliente: r.anonimizado ? 'Titular removido' : (r.leadNome ?? r.cliente),
          data: r.data,
          tipoEvento: r.tipoEvento,
          situacao: situacaoFinanceira(planoDe.get(r.id) ?? [], rs, hoje, r.total),
        },
        recebimentos: rs,
      };
    });
    const contagem = {} as Record<FiltroFinanceiro, number>;
    for (const f of ['abertos', 'atrasados', 'proximos', 'quitados', 'todos'] as const) {
      contagem[f] = todas.filter((x) => noFiltro(x.festa.situacao, f, hoje)).length;
    }
    return {
      hoje,
      filtro,
      resumo: resumoFinanceiro(
        todas.map((x) => ({ situacao: x.festa.situacao, recebimentos: x.recebimentos })),
        hoje,
      ),
      festas: todas.filter((x) => noFiltro(x.festa.situacao, filtro, hoje)).map((x) => x.festa),
      contagem,
    };
  });
}

export type RecebimentoTela = {
  id: string;
  valorCentavos: number;
  recebidoEm: string;
  forma: FormaPagamento;
  observacao: string | null;
  quem: string | null;
  estornadoEm: string | null;
  estornoMotivo: string | null;
};

export type FinanceiroDaFesta = {
  reservaId: string;
  leadId: string | null;
  cliente: string;
  data: string;
  tipoEvento: string | null;
  convidados: number | null;
  hoje: string;
  temPlano: boolean;
  /** plano salvo ou, sem plano, a sugestão (sinal + parcelas das regras) */
  plano: ParcelaPlano[];
  situacao: SituacaoFinanceira;
  recebimentos: RecebimentoTela[];
};

/** Financeiro de uma festa confirmada (null se não existir ou não for confirmada). */
export async function carregarFinanceiroDaFesta(
  usuario: UsuarioAtual,
  reservaId: string,
  tx?: Tx,
): Promise<FinanceiroDaFesta | null> {
  if (!/^[0-9a-f-]{36}$/i.test(reservaId)) return null;
  const hoje = hojeNoFuso(usuario.empresa.fuso);
  return naTransacao(usuario.id, tx, async (t) => {
    const [[r], plano, recs, [regras]] = await Promise.all([
      t
        .select({
          id: reservas.id,
          leadId: reservas.leadId,
          cliente: reservas.clienteNome,
          leadNome: leads.nome,
          anonimizado: leads.anonimizadoEm,
          data: reservas.data,
          total: reservas.valorTotalCentavos,
          sinal: reservas.sinalCentavos,
          sinalPagoEm: reservas.sinalPagoEm,
          convidados: reservas.convidados,
          tipoEvento: tiposEvento.nome,
        })
        .from(reservas)
        .leftJoin(leads, eq(leads.id, reservas.leadId))
        .leftJoin(tiposEvento, eq(tiposEvento.id, reservas.tipoEventoId))
        .where(and(eq(reservas.id, reservaId), confirmadas()))
        .limit(1),
      t
        .select()
        .from(reservaParcelas)
        .where(eq(reservaParcelas.reservaId, reservaId))
        .orderBy(asc(reservaParcelas.numero)),
      t
        .select({ r: recebimentos, quem: usuarios.nome })
        .from(recebimentos)
        .leftJoin(usuarios, eq(usuarios.id, recebimentos.criadoPor))
        .where(eq(recebimentos.reservaId, reservaId))
        .orderBy(desc(recebimentos.recebidoEm), desc(recebimentos.criadoEm)),
      t
        .select({
          parcelasMax: regrasComerciais.parcelasMax,
          prazo: regrasComerciais.prazoUltimaParcelaDias,
        })
        .from(regrasComerciais)
        .limit(1),
    ]);
    if (!r) return null;
    const salvo: ParcelaPlano[] = plano.map((p) => ({
      descricao: p.descricao,
      valorCentavos: p.valorCentavos,
      venceEm: p.venceEm,
    }));
    const lista = recs.map(({ r: x, quem }) => ({
      id: x.id,
      valorCentavos: x.valorCentavos,
      recebidoEm: x.recebidoEm,
      forma: x.forma as FormaPagamento,
      observacao: x.observacao,
      quem,
      estornadoEm: x.estornadoEm ? new Date(x.estornadoEm).toISOString() : null,
      estornoMotivo: x.estornoMotivo,
    }));
    const sugestao =
      salvo.length === 0 && (r.total ?? 0) > 0
        ? sugerirPlano({
            totalCentavos: r.total!,
            sinalCentavos: r.sinal,
            sinalPagoEm: r.sinalPagoEm,
            dataFesta: r.data,
            hoje,
            parcelasMax: regras?.parcelasMax ?? 3,
            prazoUltimaParcelaDias: regras?.prazo ?? 7,
          })
        : [];
    return {
      reservaId: r.id,
      leadId: r.leadId,
      cliente: r.anonimizado ? 'Titular removido' : (r.leadNome ?? r.cliente),
      data: r.data,
      tipoEvento: r.tipoEvento,
      convidados: r.convidados,
      hoje,
      temPlano: salvo.length > 0,
      plano: salvo.length ? salvo : sugestao,
      situacao: situacaoFinanceira(
        salvo,
        lista.map((x) => ({
          valorCentavos: x.valorCentavos,
          recebidoEm: x.recebidoEm,
          estornado: !!x.estornadoEm,
        })),
        hoje,
        r.total,
      ),
      recebimentos: lista,
    };
  });
}

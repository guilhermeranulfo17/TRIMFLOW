import 'server-only';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { FILTROS_LEAD, type ChaveFiltro } from '@/domain/leads';
import type { StatusLead, TemperaturaLead } from '@/domain/publico/status-lead';
import type { OrigemLead } from '@/domain/publico/tipos';
import type { UsuarioAtual } from '@/server/auth/sessao';
import {
  atividades,
  espacos,
  leads,
  orcamentoItens,
  orcamentos,
  tiposEvento,
  turnos,
  visitas,
} from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';

/*
 * Leituras de Leads (dono e vendedor), sempre pelo RLS. Só leitura nesta etapa: ações sobre o
 * lead (anotar, mudar status, tarefas) ficam para a Etapa 6.
 */

export type ResumoOrcamento = {
  id: string;
  numero: number;
  status: string;
  tipoEvento: string | null;
  data: string | null;
  turno: string | null;
  espaco: string | null;
  convidados: number | null;
  totalCentavos: number | null;
  validadeAte: string | null;
  criadoEm: string;
};

export type LeadDaLista = {
  id: string;
  nome: string;
  whatsappE164: string;
  status: StatusLead;
  temperatura: TemperaturaLead;
  origem: OrigemLead;
  ehTeste: boolean;
  ultimaAtividadeEm: string;
  orcamento: ResumoOrcamento | null;
};

const PRIORIDADE = sql`case ${leads.status} when 'pre_reservado' then 0 when 'novo' then 1 when 'em_andamento' then 2 else 3 end`;

async function resumosDosOrcamentos(
  tx: Parameters<Parameters<typeof comUsuario>[1]>[0],
  filtro: ReturnType<typeof eq>,
): Promise<(ResumoOrcamento & { leadId: string })[]> {
  const linhas = await tx
    .select({
      o: orcamentos,
      tipoEvento: tiposEvento.nome,
      turno: turnos.nome,
      espaco: espacos.nome,
    })
    .from(orcamentos)
    .leftJoin(tiposEvento, eq(tiposEvento.id, orcamentos.tipoEventoId))
    .leftJoin(turnos, eq(turnos.id, orcamentos.turnoId))
    .leftJoin(espacos, eq(espacos.id, orcamentos.espacoId))
    .where(filtro)
    .orderBy(desc(orcamentos.criadoEm), desc(orcamentos.numero));
  return linhas.map(({ o, tipoEvento, turno, espaco }) => ({
    id: o.id,
    leadId: o.leadId,
    numero: o.numero,
    status: o.status,
    tipoEvento,
    data: o.data,
    turno,
    espaco,
    convidados: o.convidados,
    totalCentavos: o.totalCentavos,
    validadeAte: o.validadeAte,
    criadoEm: o.criadoEm.toISOString(),
  }));
}

export async function listarLeads(
  usuario: UsuarioAtual,
  opcoes: { filtro: ChaveFiltro; busca?: string; incluirTeste?: boolean },
): Promise<LeadDaLista[]> {
  const status = FILTROS_LEAD.find((f) => f.chave === opcoes.filtro)?.status ?? null;
  const busca = opcoes.busca?.trim().slice(0, 60);
  const digitos = busca?.replace(/\D/g, '');
  return comUsuario(usuario.id, async (tx) => {
    const lista = await tx
      .select()
      .from(leads)
      .where(
        and(
          opcoes.incluirTeste ? undefined : eq(leads.ehTeste, false),
          status ? inArray(leads.status, [...status]) : undefined,
          busca
            ? or(
                ilike(leads.nome, `%${busca.replace(/[%_\\]/g, '')}%`),
                digitos && digitos.length >= 4
                  ? ilike(leads.whatsappE164, `%${digitos}%`)
                  : undefined,
              )
            : undefined,
        ),
      )
      .orderBy(asc(PRIORIDADE), desc(leads.ultimaAtividadeEm))
      .limit(200);
    if (lista.length === 0) return [];
    const resumos = await resumosDosOrcamentos(
      tx,
      inArray(
        orcamentos.leadId,
        lista.map((l) => l.id),
      ) as ReturnType<typeof eq>,
    );
    const ultimo = new Map<string, ResumoOrcamento>();
    for (const r of resumos)
      if (!ultimo.has(r.leadId) && r.status !== 'substituido') ultimo.set(r.leadId, r);
    return lista.map((l) => ({
      id: l.id,
      nome: l.nome,
      whatsappE164: l.whatsappE164,
      status: l.status,
      temperatura: l.temperatura,
      origem: l.origem,
      ehTeste: l.ehTeste,
      ultimaAtividadeEm: l.ultimaAtividadeEm.toISOString(),
      orcamento: ultimo.get(l.id) ?? null,
    }));
  });
}

export type DetalheLead = LeadDaLista & {
  consentimentoEm: string | null;
  criadoEm: string;
  orcamentos: (ResumoOrcamento & {
    itens: { descricao: string; detalhe: string | null; subtotalCentavos: number }[];
  })[];
  visitas: {
    id: string;
    dataPreferida: string;
    periodo: string;
    observacoes: string | null;
    status: string;
  }[];
  atividades: {
    id: string;
    tipo: string;
    dados: Record<string, unknown>;
    autor: string;
    criadoEm: string;
  }[];
};

export async function carregarLead(usuario: UsuarioAtual, id: string): Promise<DetalheLead | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return comUsuario(usuario.id, async (tx) => {
    const [l] = await tx.select().from(leads).where(eq(leads.id, id)).limit(1);
    if (!l) return null;
    const [resumos, itens, listaVisitas, listaAtividades] = await Promise.all([
      resumosDosOrcamentos(tx, eq(orcamentos.leadId, id)),
      tx
        .select({
          orcamentoId: orcamentoItens.orcamentoId,
          descricao: orcamentoItens.descricao,
          detalhe: orcamentoItens.detalhe,
          subtotalCentavos: orcamentoItens.subtotalCentavos,
        })
        .from(orcamentoItens)
        .innerJoin(orcamentos, eq(orcamentos.id, orcamentoItens.orcamentoId))
        .where(eq(orcamentos.leadId, id))
        .orderBy(asc(orcamentoItens.ordem)),
      tx.select().from(visitas).where(eq(visitas.leadId, id)).orderBy(desc(visitas.criadoEm)),
      tx
        .select()
        .from(atividades)
        .where(eq(atividades.leadId, id))
        .orderBy(desc(atividades.criadoEm))
        .limit(100),
    ]);
    const visiveis = resumos.filter(
      (r) => r.status !== 'substituido' && r.status !== 'em_montagem',
    );
    return {
      id: l.id,
      nome: l.nome,
      whatsappE164: l.whatsappE164,
      status: l.status,
      temperatura: l.temperatura,
      origem: l.origem,
      ehTeste: l.ehTeste,
      ultimaAtividadeEm: l.ultimaAtividadeEm.toISOString(),
      consentimentoEm: l.consentimentoEm?.toISOString() ?? null,
      criadoEm: l.criadoEm.toISOString(),
      orcamento: resumos.find((r) => r.status !== 'substituido') ?? null,
      orcamentos: visiveis.map((o) => ({
        ...o,
        itens: itens
          .filter((i) => i.orcamentoId === o.id)
          .map(({ descricao, detalhe, subtotalCentavos }) => ({
            descricao,
            detalhe,
            subtotalCentavos,
          })),
      })),
      visitas: listaVisitas.map((v) => ({
        id: v.id,
        dataPreferida: v.dataPreferida,
        periodo: v.periodo,
        observacoes: v.observacoes,
        status: v.status,
      })),
      atividades: listaAtividades.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        dados: (a.dados ?? {}) as Record<string, unknown>,
        autor: a.autor,
        criadoEm: a.criadoEm.toISOString(),
      })),
    };
  });
}

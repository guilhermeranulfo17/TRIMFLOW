import 'server-only';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { hojeNoFuso } from '@/domain/dates';
import { FILTROS_LEAD, type ChaveFiltro } from '@/domain/leads';
import { diferencasEntreVersoes, estadoValidade, type ResumoVersao } from '@/domain/proposta';
import { linkWhatsApp, mensagemEnvioProposta } from '@/domain/publico/whatsapp';
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
  usuarios,
  visitas,
} from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { urlDoSite } from '@/server/env';

/*
 * Leituras de Leads (dono e vendedor), sempre pelo RLS. Ações sobre o lead (anotar, mudar
 * status, tarefas) ficam para a Etapa 6; orçamentos têm as ações da proposta (Etapa 5).
 */

export type ResumoOrcamento = {
  id: string;
  numero: number;
  versao: number;
  token: string;
  canal: string;
  aberturas: number;
  ehTeste: boolean;
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
    .orderBy(desc(orcamentos.criadoEm), desc(orcamentos.numero), desc(orcamentos.versao));
  return linhas.map(({ o, tipoEvento, turno, espaco }) => ({
    id: o.id,
    leadId: o.leadId,
    numero: o.numero,
    versao: o.versao,
    token: o.token,
    canal: o.canal,
    aberturas: o.aberturas,
    ehTeste: o.ehTeste,
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
  /** um grupo por número; versões da mais nova para a mais antiga (a primeira é a vigente) */
  orcamentos: GrupoOrcamento[];
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
    /** nome de quem fez, quando foi alguém da equipe */
    quem: string | null;
    criadoEm: string;
  }[];
};

export type VersaoDoLead = ResumoOrcamento & {
  itens: { descricao: string; detalhe: string | null; subtotalCentavos: number }[];
  /** o que mudou em relação à versão anterior */
  diferencas: string[];
  validade: { expirada: boolean; texto: string } | null;
  link: string;
  linkWhatsapp: string;
};

export type GrupoOrcamento = { numero: number; versoes: VersaoDoLead[] };

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
          tipo: orcamentoItens.tipo,
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
        .select({ a: atividades, quem: usuarios.nome })
        .from(atividades)
        .leftJoin(usuarios, eq(usuarios.id, atividades.usuarioId))
        .where(eq(atividades.leadId, id))
        .orderBy(desc(atividades.criadoEm))
        .limit(100),
    ]);
    const hoje = hojeNoFuso(usuario.empresa.fuso);
    const site = urlDoSite() ?? '';
    const itensDe = (oid: string) => itens.filter((i) => i.orcamentoId === oid);
    const resumoVersao = (o: ResumoOrcamento): ResumoVersao => ({
      data: o.data,
      turno: o.turno,
      espaco: o.espaco,
      convidados: o.convidados,
      pacote: itensDe(o.id).find((i) => i.tipo === 'pacote')?.descricao ?? null,
      extras: itensDe(o.id)
        .filter((i) => i.tipo === 'opcional')
        .map((i) => i.descricao),
      totalCentavos: o.totalCentavos,
    });
    const grupos = new Map<number, (typeof resumos)[number][]>();
    for (const r of resumos) {
      if (r.status === 'em_montagem') continue;
      grupos.set(r.numero, [...(grupos.get(r.numero) ?? []), r]);
    }
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
      orcamentos: [...grupos.entries()].map(([numero, lista]) => {
        const versoes = [...lista].sort((a, b) => b.versao - a.versao);
        return {
          numero,
          versoes: versoes.map((o, i) => {
            const anterior = versoes[i + 1];
            const link = `${site}/b/${usuario.empresa.slug}/proposta/${o.token}`;
            return {
              ...o,
              itens: itensDe(o.id).map(({ descricao, detalhe, subtotalCentavos }) => ({
                descricao,
                detalhe,
                subtotalCentavos,
              })),
              diferencas: anterior
                ? diferencasEntreVersoes(resumoVersao(anterior), resumoVersao(o))
                : [],
              validade: o.validadeAte ? estadoValidade(o.validadeAte, hoje) : null,
              link,
              linkWhatsapp: linkWhatsApp(
                l.whatsappE164,
                mensagemEnvioProposta(usuario.empresa.nome, l.nome, link),
              ),
            };
          }),
        };
      }),
      visitas: listaVisitas.map((v) => ({
        id: v.id,
        dataPreferida: v.dataPreferida,
        periodo: v.periodo,
        observacoes: v.observacoes,
        status: v.status,
      })),
      atividades: listaAtividades.map(({ a, quem }) => ({
        id: a.id,
        tipo: a.tipo,
        dados: (a.dados ?? {}) as Record<string, unknown>,
        autor: a.autor,
        quem: a.autor === 'usuario' ? quem : null,
        criadoEm: a.criadoEm.toISOString(),
      })),
    };
  });
}

import 'server-only';
import { and, asc, desc, eq, gt, isNull, isNotNull, lt, or, sql } from 'drizzle-orm';
import { limitesDoDia } from '@/domain/leads';
import { formatPhoneBR } from '@/domain/phone';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { leads, tarefas, usuarios } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { automaticaDaTarefa } from './automatica';
import type { SituacaoMensagem } from '@/domain/leads/mensagens';

/*
 * Tela "Tarefas": as do usuário (e as sem responsável) da empresa, pelo RLS. Atrasadas, hoje,
 * próximos 7 dias e feitas recentemente. Leads fechados já têm as tarefas canceladas pelo banco.
 */

export type TarefaDaTela = {
  id: string;
  titulo: string;
  descricao: string | null;
  venceEm: string;
  feitaEm: string | null;
  mensagemSugerida: string | null;
  automatica: { situacao: SituacaoMensagem; motivo: string } | null;
  lead: { id: string; nome: string; telefone: string; whatsappE164: string | null };
  responsavelNome: string | null;
};

export type TelaTarefas = {
  atrasadas: TarefaDaTela[];
  hoje: TarefaDaTela[];
  proximas: TarefaDaTela[];
  feitas: TarefaDaTela[];
};

export async function carregarTarefas(usuario: UsuarioAtual): Promise<TelaTarefas> {
  const agora = new Date();
  const { fimHoje } = limitesDoDia(agora, usuario.empresa.fuso);
  const daqui7 = new Date(fimHoje.getTime() + 7 * 86_400_000);
  const minhas = or(eq(tarefas.responsavelId, usuario.id), isNull(tarefas.responsavelId));
  const colunas = {
    t: tarefas,
    leadNome: leads.nome,
    leadWhatsapp: leads.whatsappE164,
    responsavelNome: usuarios.nome,
  };
  const { abertas, feitas } = await comUsuario(usuario.id, async (tx) => ({
    abertas: await tx
      .select(colunas)
      .from(tarefas)
      .innerJoin(leads, eq(leads.id, tarefas.leadId))
      .leftJoin(usuarios, eq(usuarios.id, tarefas.responsavelId))
      .where(
        and(
          minhas,
          isNull(tarefas.feitaEm),
          isNull(tarefas.canceladaEm),
          lt(tarefas.venceEfetivo, daqui7),
        ),
      )
      .orderBy(asc(tarefas.venceEfetivo))
      .limit(300),
    feitas: await tx
      .select(colunas)
      .from(tarefas)
      .innerJoin(leads, eq(leads.id, tarefas.leadId))
      .leftJoin(usuarios, eq(usuarios.id, tarefas.responsavelId))
      .where(
        and(
          minhas,
          isNotNull(tarefas.feitaEm),
          gt(tarefas.feitaEm, sql`now() - interval '3 days'`),
        ),
      )
      .orderBy(desc(tarefas.feitaEm))
      .limit(30),
  }));
  const mapear = (r: (typeof abertas)[number]): TarefaDaTela => ({
    id: r.t.id,
    titulo: r.t.titulo,
    descricao: r.t.descricao,
    venceEm: (r.t.venceEfetivo ?? r.t.venceEm).toISOString(),
    feitaEm: r.t.feitaEm?.toISOString() ?? null,
    mensagemSugerida: r.t.mensagemSugerida,
    automatica: automaticaDaTarefa(r.t.origem, r.t.regra, r.t.mensagemDados),
    lead: {
      id: r.t.leadId,
      nome: r.leadNome,
      telefone: r.leadWhatsapp ? formatPhoneBR(r.leadWhatsapp) : '',
      whatsappE164: r.leadWhatsapp,
    },
    responsavelNome: r.responsavelNome,
  });
  const vence = (r: (typeof abertas)[number]) => r.t.venceEfetivo ?? r.t.venceEm;
  return {
    atrasadas: abertas.filter((r) => vence(r) < agora).map(mapear),
    hoje: abertas.filter((r) => vence(r) >= agora && vence(r) < fimHoje).map(mapear),
    proximas: abertas.filter((r) => vence(r) >= fimHoje).map(mapear),
    feitas: feitas.map(mapear),
  };
}

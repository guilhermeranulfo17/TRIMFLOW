import 'server-only';
import { sql } from 'drizzle-orm';
import { mascararDocumento } from '@/domain/cobranca/documento';
import { mrrDaAssinatura, resumoInterno, type ResumoInterno } from '@/domain/cobranca/mrr';
import type { Situacao } from '@/domain/cobranca/situacao';
import { obterDb } from '@/server/db/client';

/*
 * Leituras do /interno (equipe Orkestra). Conexão administrativa: só depois de exigirAdmin().
 * Expõe o necessário para atender e acompanhar: nada de leads, telefones ou dados do cliente
 * final; documento do pagador só mascarado.
 */

export type EmpresaInterna = {
  id: string;
  nome: string;
  slug: string;
  situacao: Situacao;
  trialAte: Date | null;
  isenta: boolean;
  criadoEm: Date;
  onboardingPasso: number;
  onboardingConcluido: boolean;
  suspensaManual: boolean;
  plano: string | null;
  ciclo: 'mensal' | 'anual' | null;
  valorCentavos: number | null;
  statusAssinatura: 'pendente' | 'ativa' | 'cancelada' | null;
  cancelamentoMotivo: string | null;
  mrrCentavos: number;
  ultimoAcesso: Date | null;
  leads30d: number;
  reservas: number;
  pagou: boolean;
  suporteAte: Date | null;
};

type Linha = Record<string, unknown>;
const data = (v: unknown) => (v ? new Date(v as string) : null);

function paraEmpresa(l: Linha): EmpresaInterna {
  const status = (l.ass_status as EmpresaInterna['statusAssinatura']) ?? null;
  const ciclo = (l.ciclo as EmpresaInterna['ciclo']) ?? null;
  const valor = l.valor_centavos == null ? null : Number(l.valor_centavos);
  return {
    id: String(l.id),
    nome: String(l.nome),
    slug: String(l.slug),
    situacao: l.plano as Situacao,
    trialAte: data(l.trial_ate),
    isenta: Boolean(l.isenta),
    criadoEm: new Date(l.criado_em as string),
    onboardingPasso: Number(l.onboarding_passo ?? 1),
    onboardingConcluido: !!l.onboarding_concluido_em,
    suspensaManual: !!l.suspensa_manual_em,
    plano: (l.plano_codigo as string) ?? null,
    ciclo,
    valorCentavos: valor,
    statusAssinatura: status,
    cancelamentoMotivo: (l.cancelamento_motivo as string) ?? null,
    mrrCentavos:
      status && ciclo && valor !== null
        ? mrrDaAssinatura({ status, ciclo, valorCentavos: valor })
        : 0,
    ultimoAcesso: data(l.ultimo_acesso),
    leads30d: Number(l.leads_30d ?? 0),
    reservas: Number(l.reservas ?? 0),
    pagou: Boolean(l.pagou),
    suporteAte: data(l.suporte_ate),
  };
}

const CONSULTA = sql`
  select e.id, e.nome, e.slug, e.plano, e.trial_ate, e.isenta, e.criado_em, e.onboarding_passo,
    e.onboarding_concluido_em, e.suspensa_manual_em,
    a.plano_codigo, a.ciclo, a.valor_centavos, a.status as ass_status, a.cancelamento_motivo,
    (select max(au.last_sign_in_at) from public.usuarios u join auth.users au on au.id = u.id
      where u.empresa_id = e.id) as ultimo_acesso,
    (select count(*) from public.leads l
      where l.empresa_id = e.id and not l.eh_teste and l.criado_em > now() - interval '30 days')::int as leads_30d,
    (select count(*) from public.reservas r
      where r.empresa_id = e.id and r.tipo = 'confirmada' and r.status in ('ativa', 'realizada'))::int as reservas,
    exists (select 1 from public.cobrancas c
      where c.empresa_id = e.id and c.status in ('confirmada', 'recebida')) as pagou,
    public.suporte_vigente(e.id) as suporte_ate
  from public.empresas e
  left join lateral (select * from public._assinatura_referencia(e.id)) a on true`;

/** Empresas reais (a de demonstração fica fora da lista e das métricas, Etapa 9B). */
export async function listarEmpresasInternas(busca?: string | null): Promise<EmpresaInterna[]> {
  const termo = busca?.trim() ? `%${busca.trim().toLowerCase()}%` : null;
  const linhas = await obterDb().execute<Linha>(
    termo
      ? sql`${CONSULTA} where not e.eh_demo and (lower(e.nome) like ${termo} or e.slug like ${termo})
          order by e.criado_em desc limit 500`
      : sql`${CONSULTA} where not e.eh_demo order by e.criado_em desc limit 500`,
  );
  return [...linhas].map(paraEmpresa);
}

export async function visaoGeralInterna(empresas: EmpresaInterna[]): Promise<ResumoInterno> {
  return resumoInterno(
    empresas.map((e) => ({
      situacao: e.situacao,
      trialAte: e.trialAte,
      isenta: e.isenta,
      pagou: e.pagou,
      assinatura:
        e.statusAssinatura && e.ciclo && e.valorCentavos !== null
          ? { status: e.statusAssinatura, ciclo: e.ciclo, valorCentavos: e.valorCentavos }
          : null,
      cancelamentoMotivo: e.cancelamentoMotivo,
    })),
    new Date(),
  );
}

export type DetalheInterno = EmpresaInterna & {
  dono: { id: string; nome: string; email: string } | null;
  usuariosAtivos: number;
  pagador: { nome: string; documento: string; email: string } | null;
  faturas: { vencimento: string; valorCentavos: number; status: string; tipo: string }[];
  auditoria: { quando: Date; admin: string; acao: string }[];
};

export async function detalheEmpresaInterna(id: string): Promise<DetalheInterno | null> {
  const db = obterDb();
  const [l] = await db.execute<Linha>(sql`${CONSULTA} where e.id = ${id}`);
  if (!l) return null;
  const [dono] = await db.execute<Linha>(
    sql`select id, nome, email from public.usuarios where empresa_id = ${id} and perfil = 'dono'
      and ativo order by criado_em limit 1`,
  );
  const [ativos] = await db.execute<Linha>(
    sql`select count(*)::int as n from public.usuarios where empresa_id = ${id} and ativo`,
  );
  const [pagador] = await db.execute<Linha>(
    sql`select nome, documento, email from public.empresas_cobranca where empresa_id = ${id}`,
  );
  const faturas = await db.execute<Linha>(
    sql`select vencimento::text, valor_centavos, status, tipo from public.cobrancas
      where empresa_id = ${id} order by vencimento desc limit 12`,
  );
  const auditoria = await db.execute<Linha>(
    sql`select criado_em, admin_email, acao from public.auditoria_interna
      where empresa_id = ${id} order by criado_em desc limit 20`,
  );
  return {
    ...paraEmpresa(l),
    dono: dono ? { id: String(dono.id), nome: String(dono.nome), email: String(dono.email) } : null,
    usuariosAtivos: Number(ativos?.n ?? 0),
    pagador: pagador
      ? {
          nome: String(pagador.nome),
          documento: mascararDocumento(String(pagador.documento)),
          email: String(pagador.email),
        }
      : null,
    faturas: [...faturas].map((f) => ({
      vencimento: String(f.vencimento),
      valorCentavos: Number(f.valor_centavos),
      status: String(f.status),
      tipo: String(f.tipo),
    })),
    auditoria: [...auditoria].map((a) => ({
      quando: new Date(a.criado_em as string),
      admin: String(a.admin_email),
      acao: String(a.acao),
    })),
  };
}

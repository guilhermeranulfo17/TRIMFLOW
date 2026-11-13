import 'server-only';
import { sql } from 'drizzle-orm';
import { idDoLead, type MarcoConta } from '@/domain/prospeccao';
import type { Db } from '@/server/db/client';

/*
 * ACESSO ADMINISTRATIVO (ignora RLS), revisado: o vínculo da empresa com o lead do CRM de
 * prospecção, em empresas.prospeccao. Roda sem usuário logado (depois da resposta, no after())
 * e a coluna não é gravável pela API. Lê só o que o CRM recebe (nome do dono, e-mail, nome e
 * WhatsApp do buffet e a data da conta) e escreve só nessa coluna. A conta de demonstração fica
 * sempre de fora.
 */

export type ContaParaCrm = {
  empresaId: string;
  buffet: string;
  whatsappE164: string | null;
  criadaEm: Date;
  nome: string;
  email: string;
  /** id do lead que veio no link (?r=), guardado no cadastro */
  r: string | null;
  /** id do lead no CRM, depois que o cadastro foi avisado */
  leadId: string | null;
};

type Linha = {
  empresa_id: string;
  buffet: string;
  whatsapp_e164: string | null;
  criado_em: Date | string;
  nome: string;
  email: string;
  r: string | null;
  crm_lead_id: string | null;
};

/** A conta (empresa + dono) pela empresa ou pelo usuário dono; null se não achar ou for a demo. */
export async function lerConta(
  db: Db,
  ref: { empresaId: string } | { usuarioId: string },
): Promise<ContaParaCrm | null> {
  const filtro =
    'empresaId' in ref ? sql`e.id = ${ref.empresaId}::uuid` : sql`u.id = ${ref.usuarioId}::uuid`;
  const [l] = await db.execute<Linha>(sql`
    select e.id as empresa_id, e.nome as buffet,
           coalesce(e.whatsapp_e164, u.whatsapp_e164) as whatsapp_e164, e.criado_em,
           u.nome, u.email,
           e.prospeccao->>'r' as r, e.prospeccao->>'crm_lead_id' as crm_lead_id
    from public.empresas e
    join public.usuarios u on u.empresa_id = e.id and u.perfil = 'dono'
    where ${filtro} and not e.eh_demo and not e.eh_apresentacao
    order by u.criado_em
    limit 1`);
  if (!l) return null;
  return {
    empresaId: l.empresa_id,
    buffet: l.buffet,
    whatsappE164: l.whatsapp_e164,
    criadaEm: new Date(l.criado_em),
    nome: l.nome,
    email: l.email,
    r: idDoLead(l.r),
    leadId: idDoLead(l.crm_lead_id),
  };
}

/** Guarda o r do link na empresa do dono recém-criado (antes de falar com o CRM). */
export async function guardarR(db: Db, usuarioId: string, r: string): Promise<void> {
  await db.execute(sql`
    update public.empresas e
    set prospeccao = coalesce(e.prospeccao, '{}'::jsonb) || jsonb_build_object('r', ${r}::text)
    from public.usuarios u
    where u.id = ${usuarioId}::uuid and u.perfil = 'dono' and e.id = u.empresa_id
      and not e.eh_demo and not e.eh_apresentacao and not coalesce(e.prospeccao, '{}'::jsonb) ? 'crm_lead_id'`);
}

/** O cadastro foi avisado: a empresa passa a apontar para o lead do CRM. */
export async function gravarLead(db: Db, empresaId: string, leadId: string): Promise<void> {
  await db.execute(sql`
    update public.empresas
    set prospeccao = coalesce(prospeccao, '{}'::jsonb)
      || jsonb_build_object('crm_lead_id', ${leadId}::text, 'conta_em', now())
    where id = ${empresaId}::uuid`);
}

const CHAVE: Record<MarcoConta, string> = { pacote: 'pacote_em', pagina: 'pagina_em' };

/**
 * Marca o marco como avisado, uma única vez (o banco decide: duas ações ao mesmo tempo não
 * mandam dois eventos). true = este é o primeiro; false = já tinha sido avisado.
 */
export async function marcarMarco(db: Db, empresaId: string, marco: MarcoConta): Promise<boolean> {
  const chave = CHAVE[marco];
  const linhas = await db.execute<{ id: string }>(sql`
    update public.empresas
    set prospeccao = coalesce(prospeccao, '{}'::jsonb) || jsonb_build_object(${chave}::text, now())
    where id = ${empresaId}::uuid and not coalesce(prospeccao, '{}'::jsonb) ? ${chave}::text
    returning id`);
  return linhas.length > 0;
}

/** O CRM falhou depois da marca: desfaz, para a próxima vez tentar de novo. */
export async function desmarcarMarco(db: Db, empresaId: string, marco: MarcoConta): Promise<void> {
  await db.execute(sql`
    update public.empresas set prospeccao = prospeccao - ${CHAVE[marco]}::text
    where id = ${empresaId}::uuid`);
}

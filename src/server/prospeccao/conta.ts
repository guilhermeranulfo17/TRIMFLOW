import 'server-only';
import type { MarcoConta } from '@/domain/prospeccao';
import type { Db } from '@/server/db/client';
import type { ClienteCrm } from './cliente';
import { criouConta, marcoDaConta } from './rastreio';
import { desmarcarMarco, gravarLead, guardarR, lerConta, marcarMarco } from './vinculo';

/*
 * Eventos da conta (ARQUITETURA §81): "Criou conta", "Cadastrou pacote" e "Publicou a página".
 * Dependências injetadas (banco administrativo e cliente do CRM), para testar com um CRM falso.
 */

export type DepsProspeccao = { db: Db; crm: ClienteCrm };

/**
 * Garante que o cadastro foi avisado e devolve o id do lead no CRM. Se o CRM estava fora do ar
 * na hora do cadastro, a tentativa se repete aqui, no próximo marco da conta (com a data
 * verdadeira da conta, lida do banco).
 */
export async function sincronizarConta(
  d: DepsProspeccao,
  ref: { empresaId: string } | { usuarioId: string },
): Promise<{ empresaId: string; leadId: string } | null> {
  const conta = await lerConta(d.db, ref);
  if (!conta) return null;
  if (conta.leadId) return { empresaId: conta.empresaId, leadId: conta.leadId };
  if (!conta.whatsappE164) return null;
  const leadId = await criouConta(d.crm, {
    r: conta.r,
    whatsappE164: conta.whatsappE164,
    nome: conta.nome,
    buffet: conta.buffet,
    email: conta.email,
    criadaEm: conta.criadaEm,
  });
  if (!leadId) return null;
  await gravarLead(d.db, conta.empresaId, leadId);
  return { empresaId: conta.empresaId, leadId };
}

/** 3. Cadastro: guarda o r do link (se veio) e avisa o CRM. */
export async function avisarCadastro(
  d: DepsProspeccao,
  usuarioId: string,
  r: string | null,
): Promise<string | null> {
  if (r) await guardarR(d.db, usuarioId, r);
  return (await sincronizarConta(d, { usuarioId }))?.leadId ?? null;
}

/**
 * 4 e 5. Marco da conta, só na primeira vez. A marca vem antes do aviso (duas ações juntas não
 * mandam dois eventos) e é desfeita se o CRM falhar.
 */
export async function avisarMarco(
  d: DepsProspeccao,
  empresaId: string,
  marco: MarcoConta,
): Promise<boolean> {
  const conta = await sincronizarConta(d, { empresaId });
  if (!conta) return false;
  if (!(await marcarMarco(d.db, empresaId, marco))) return false;
  try {
    await marcoDaConta(d.crm, conta.leadId, marco);
    return true;
  } catch (erro) {
    await desmarcarMarco(d.db, empresaId, marco);
    throw erro;
  }
}

import 'server-only';
import {
  camposDaConta,
  etapaAoAbrirDemonstracao,
  etapaAoCriarConta,
  mesmoTelefone,
  telefoneDoCrm,
  TEXTO_ABRIU_DEMONSTRACAO,
  TEXTO_MARCO,
  TEXTO_MONTOU_ORCAMENTO,
  textoCriouConta,
  type MarcoConta,
} from '@/domain/prospeccao';
import { formatPhoneBR } from '@/domain/phone';
import type { ClienteCrm, LeadCrm } from './cliente';

/*
 * O que o Orkestra manda ao CRM em cada evento (ARQUITETURA §81). Funções sem ambiente: recebem o
 * cliente do CRM (nos testes, um CRM falso em memória). Quem chama cuida de rodar em segundo
 * plano e de engolir o erro (server/prospeccao/index).
 *
 * Regras: nunca rebaixar a etapa (domain/prospeccao) e, sem lead conhecido, não enviar nada,
 * exceto no cadastro, que cria o lead.
 */

/**
 * 1. "Abriu a demonstração": a página foi aberta com ?r=<id do lead>. Grava o evento e, se o lead
 * estava em abordado ou respondeu, passa para qualificado. Lead que não existe: nada.
 */
export async function abriuDemonstracao(crm: ClienteCrm, r: string): Promise<boolean> {
  const lead = await crm.porId(r);
  if (!lead) return false;
  await crm.evento(lead.id, TEXTO_ABRIU_DEMONSTRACAO);
  const etapa = etapaAoAbrirDemonstracao(lead.etapa);
  const telefone = telefoneDoCrm(lead.telefone);
  if (etapa && telefone) await crm.upsert({ telefone, etapa });
  return true;
}

/** 2. "Montou um orçamento na demonstração": a pessoa chegou ao resultado (com r). */
export async function montouOrcamento(crm: ClienteCrm, r: string): Promise<boolean> {
  const lead = await crm.porId(r);
  if (!lead) return false;
  await crm.evento(lead.id, TEXTO_MONTOU_ORCAMENTO);
  return true;
}

export type ContaCriada = {
  /** id do lead que veio no link (?r=), se veio */
  r: string | null;
  /** WhatsApp informado no cadastro, em E.164 */
  whatsappE164: string;
  nome: string;
  buffet: string;
  email: string;
  criadaEm: Date;
};

/**
 * 3. "Criou conta": acha o lead pelo r ou pelo WhatsApp informado; se não existir, cria. Faz o
 * upsert (contato, buffet só em lead novo, tem WhatsApp, quente, próximo passo e, se couber,
 * etapa demo_marcada) e grava o evento. Devolve o id do lead (o vínculo da empresa), ou null se
 * o WhatsApp não serve para o CRM.
 */
export async function criouConta(crm: ClienteCrm, conta: ContaCriada): Promise<string | null> {
  const informado = telefoneDoCrm(conta.whatsappE164);
  if (!informado) return null;

  let lead: LeadCrm | null = conta.r ? await crm.porId(conta.r) : null;
  lead ??= await crm.porTelefone(informado);

  // o upsert é pelo telefone: no lead que já existe, o telefone DELE (senão nasceria outro lead)
  const telefone = telefoneDoCrm(lead?.telefone) ?? informado;
  const etapa = etapaAoCriarConta(lead?.etapa);
  const gravado = await crm.upsert({
    telefone,
    ...camposDaConta({ nome: conta.nome, buffet: conta.buffet, leadNovo: lead === null }),
    ...(etapa ? { etapa } : {}),
  });

  const id = lead?.id ?? gravado?.id ?? (await crm.porTelefone(telefone))?.id ?? null;
  if (!id) return null;

  let texto = textoCriouConta(conta.criadaEm, conta.email);
  // o lead veio pelo link mas a pessoa informou outro número: anota, para a equipe saber
  if (lead && !mesmoTelefone(lead.telefone, informado)) {
    texto += `, WhatsApp informado ${formatPhoneBR(conta.whatsappE164)}`;
  }
  await crm.evento(id, texto);
  return id;
}

/** 4 e 5. "Cadastrou pacote" e "Publicou a página": uma linha na linha do tempo do lead. */
export async function marcoDaConta(crm: ClienteCrm, leadId: string, marco: MarcoConta) {
  await crm.evento(leadId, TEXTO_MARCO[marco]);
}

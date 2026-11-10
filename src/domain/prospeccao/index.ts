/*
 * Rastreio para o CRM de prospecção (ARQUITETURA §81). O dono do Orkestra prospecta buffets pelo
 * WhatsApp num CRM separado; o Orkestra avisa esse CRM quando o buffet prospectado abre a
 * demonstração, monta um orçamento nela, cria conta, cadastra pacote e publica a página.
 *
 * Aqui só as regras puras: a ordem das etapas (nunca rebaixar), os textos dos eventos, o formato
 * do telefone e do id que vem no link (?r=). As chamadas ficam em server/prospeccao.
 */

/** Etapas do funil do CRM, em ordem. `perdido` e `frio` ficam fora da ordem. */
export const ETAPAS_CRM = [
  'novo',
  'abordado',
  'respondeu',
  'qualificado',
  'demo_marcada',
  'demo_feita',
  'proposta',
  'fechado',
] as const;
export type EtapaCrm = (typeof ETAPAS_CRM)[number];

const ordem = (etapa: string | null | undefined): number =>
  ETAPAS_CRM.indexOf((etapa ?? '') as EtapaCrm);

/**
 * Abriu a demonstração: quem estava em `abordado` ou `respondeu` vira `qualificado`. Qualquer
 * outra etapa fica como está (null = não mexer). Nunca rebaixa.
 */
export function etapaAoAbrirDemonstracao(atual: string | null | undefined): EtapaCrm | null {
  return atual === 'abordado' || atual === 'respondeu' ? 'qualificado' : null;
}

/**
 * Criou conta: quem está antes de `demo_marcada` (ou em `frio`, ou é lead novo, sem etapa) vira
 * `demo_marcada`. De `demo_marcada` em diante, `perdido` e etapa desconhecida ficam como estão
 * (null = não mexer). Nunca rebaixa.
 */
export function etapaAoCriarConta(atual: string | null | undefined): EtapaCrm | null {
  if (atual === null || atual === undefined || atual === '' || atual === 'frio') {
    return 'demo_marcada';
  }
  const i = ordem(atual);
  return i >= 0 && i < ordem('demo_marcada') ? 'demo_marcada' : null;
}

// ---------------------------------------------------------------------------
// Link com ?r=<id do lead no CRM>
// ---------------------------------------------------------------------------

export const PARAMETRO_PROSPECCAO = 'r';
/** Cookie (e chave do armazenamento local) que guarda o r até o cadastro. */
export const COOKIE_PROSPECCAO = 'orkestra_r';
export const DIAS_COOKIE_PROSPECCAO = 90;

/** O id do lead no CRM é um uuid. Qualquer outra coisa é descartada (vai para a URL do CRM). */
export function idDoLead(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) ? v : null;
}

/** Eventos que a landing manda (com o r): os outros nascem no servidor. */
export const EVENTOS_DEMONSTRACAO = ['abriu_demo', 'montou_orcamento'] as const;
export type EventoDemonstracao = (typeof EVENTOS_DEMONSTRACAO)[number];

export function eventoDemonstracao(valor: unknown): EventoDemonstracao | null {
  return (EVENTOS_DEMONSTRACAO as readonly unknown[]).includes(valor)
    ? (valor as EventoDemonstracao)
    : null;
}

/** Marcos da conta, avisados uma única vez por empresa. */
export const MARCOS_CONTA = ['pacote', 'pagina'] as const;
export type MarcoConta = (typeof MARCOS_CONTA)[number];

// ---------------------------------------------------------------------------
// Telefone no formato do CRM: 55 + DDD + número, só dígitos
// ---------------------------------------------------------------------------

/** "+5534991355450" → "5534991355450"; null se não for um número do Brasil com DDD. */
export function telefoneDoCrm(e164: string | null | undefined): string | null {
  const digitos = (e164 ?? '').replace(/\D/g, '');
  return /^55\d{10,11}$/.test(digitos) ? digitos : null;
}

/** Os 8 últimos dígitos: a busca do CRM (`GET /leads?q=`). */
export function ultimos8(telefone: string): string {
  return telefone.replace(/\D/g, '').slice(-8);
}

/**
 * Mesmo número? Compara o DDD e os 8 últimos dígitos, para um cadastro antigo sem o 9 na frente
 * ("553491355450") casar com o celular de hoje ("5534991355450").
 */
export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = telefoneDoCrm(a);
  const y = telefoneDoCrm(b);
  if (!x || !y) return false;
  return x.slice(2, 4) === y.slice(2, 4) && x.slice(-8) === y.slice(-8);
}

// ---------------------------------------------------------------------------
// Textos da linha do tempo e campos do lead
// ---------------------------------------------------------------------------

export const TEXTO_ABRIU_DEMONSTRACAO = 'Abriu a demonstração';
export const TEXTO_MONTOU_ORCAMENTO = 'Montou um orçamento na demonstração';
export const TEXTO_MARCO: Record<MarcoConta, string> = {
  pacote: 'Cadastrou pacote',
  pagina: 'Publicou a página',
};
export const PROXIMO_PASSO_CONTA = 'Gui chamar: criou conta no teste';

const FUSO_PADRAO = 'America/Sao_Paulo';

/** "Criou conta em 10/11 às 14:32, e-mail dona@buffet.com" (hora de Brasília). */
export function textoCriouConta(em: Date, email: string, fuso: string = FUSO_PADRAO): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(em);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '';
  return `Criou conta em ${p('day')}/${p('month')} às ${p('hour')}:${p('minute')}, e-mail ${email.trim()}`;
}

/** Campos do lead no cadastro (o que o CRM recebe no upsert, fora telefone e etapa). */
export function camposDaConta(o: { nome: string; buffet: string; leadNovo: boolean }) {
  return {
    contato: o.nome.trim(),
    // o nome do buffet só entra em lead novo: no que já existe, vale o que a prospecção anotou
    ...(o.leadNovo ? { buffet: o.buffet.trim() } : {}),
    tem_whatsapp: 'sim',
    temperatura: 'quente',
    proximo_passo: PROXIMO_PASSO_CONTA,
  };
}

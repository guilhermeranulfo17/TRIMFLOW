import { dividirArredondando, type Centavos } from '../money';

/*
 * Preços da landing (Etapa 9.6). Os dados vêm de publico.planos_vitrine(); aqui só as regras de
 * exibição: desconto do anual, mensal equivalente e a lista de itens de cada plano. Nada de valor
 * fixo: tudo sai dos dados do banco.
 */

export type PlanoVitrine = {
  codigo: string;
  nome: string;
  precoMensalCentavos: Centavos;
  precoAnualCentavos: Centavos;
  maxUsuarios: number;
  /** null = ilimitado */
  maxEspacos: number | null;
  whatsappAvisos: boolean;
  followUp: boolean;
  numerosCompleto: boolean;
  /**
   * Contratos enviados por mês (planos.contratos_mes): null = sem limite; undefined = a vitrine
   * não informou (versão anterior da função), e a página não mostra número.
   */
  contratosMes?: number | null;
};

export type CicloVitrine = 'mensal' | 'anual';

export type DescontoAnual = {
  /** 12 mensalidades − anual (0 se o anual não for mais barato) */
  economiaCentavos: Centavos;
  /** economia sobre 12 mensalidades, em basis points (arredondado meio para cima) */
  economiaBp: number;
  /** meses inteiros de graça (2 = "2 meses grátis") */
  mesesGratis: number;
  /** anual ÷ 12, para mostrar "R$ X/mês no anual" */
  mensalEquivalenteCentavos: Centavos;
};

export function descontoAnual(p: PlanoVitrine): DescontoAnual {
  const doze = p.precoMensalCentavos * 12;
  const economia = Math.max(0, doze - p.precoAnualCentavos);
  return {
    economiaCentavos: economia,
    economiaBp: doze > 0 ? Math.floor((economia * 10_000 + doze / 2) / doze) : 0,
    mesesGratis: p.precoMensalCentavos > 0 ? Math.floor(economia / p.precoMensalCentavos) : 0,
    mensalEquivalenteCentavos: dividirArredondando(p.precoAnualCentavos, 12),
  };
}

/** Rótulo do selo do anual a partir dos dados ("2 meses grátis"); null se não houver desconto. */
export function seloAnual(planos: PlanoVitrine[]): string | null {
  const meses = planos.map((p) => descontoAnual(p).mesesGratis).filter((m) => m > 0);
  if (meses.length === 0) return null;
  const m = Math.min(...meses);
  return m === 1 ? '1 mês grátis' : `${m} meses grátis`;
}

export type RecursoPlano = 'whatsappAvisos' | 'followUp' | 'numerosCompleto';

/**
 * Valor exibido no cartão: no mensal, a mensalidade; no anual, o equivalente por mês (anual ÷ 12)
 * e, à parte, o total cobrado de uma vez no ano.
 */
export function precoNoCiclo(
  p: PlanoVitrine,
  ciclo: CicloVitrine,
): { porMesCentavos: Centavos; totalAnualCentavos: Centavos | null; economiaCentavos: Centavos } {
  if (ciclo === 'mensal') {
    return { porMesCentavos: p.precoMensalCentavos, totalAnualCentavos: null, economiaCentavos: 0 };
  }
  const d = descontoAnual(p);
  return {
    porMesCentavos: d.mensalEquivalenteCentavos,
    totalAnualCentavos: p.precoAnualCentavos,
    economiaCentavos: d.economiaCentavos,
  };
}

export type ItemPlano = { texto: string; incluso: boolean };

function itemContratos(n: number | null | undefined): ItemPlano {
  if (n === undefined) return { texto: 'Contratos com aceite eletrônico', incluso: true };
  if (n === null) return { texto: 'Contratos com aceite eletrônico, sem limite', incluso: true };
  if (n <= 0) return { texto: 'Contratos com aceite eletrônico', incluso: false };
  return {
    texto: `Contratos com aceite eletrônico: até ${n} por mês`,
    incluso: true,
  };
}

/**
 * Itens do cartão do plano, na ordem de exibição; `incluso = false` aparece esmaecido. Só entra
 * aqui o que os dados do plano dizem (planos_vitrine) ou o que vale para todos os planos no app
 * (link, leads e tarefas, agenda, propostas, recebimentos, avisos no painel e no celular).
 */
export function itensDoPlano(p: PlanoVitrine): ItemPlano[] {
  const usuarios = p.maxUsuarios === 1 ? '1 usuário' : `Até ${p.maxUsuarios} usuários`;
  const espacos =
    p.maxEspacos === null
      ? 'Espaços ilimitados'
      : p.maxEspacos === 1
        ? '1 espaço'
        : `Até ${p.maxEspacos} espaços`;
  return [
    { texto: usuarios, incluso: true },
    { texto: espacos, incluso: true },
    { texto: 'Link de orçamento com seus pacotes e regras', incluso: true },
    { texto: 'Leads, tarefas e mensagens prontas', incluso: true },
    { texto: 'Agenda com turnos e pré-reservas', incluso: true },
    { texto: 'Propostas na web e em PDF', incluso: true },
    itemContratos(p.contratosMes),
    { texto: 'Controle de recebimentos por festa', incluso: true },
    { texto: 'Avisos no painel e no celular', incluso: true },
    { texto: 'Avisos no WhatsApp para a equipe', incluso: p.whatsappAvisos },
    { texto: 'Tarefas automáticas de follow-up', incluso: p.followUp },
    {
      texto: p.numerosCompleto
        ? 'Números completos: origem, perdas, ocupação e datas livres'
        : 'Números: resumo e etapas até a reserva',
      incluso: true,
    },
  ];
}

/**
 * O recurso é só de algum plano (não do mais barato)? Devolve o nome do plano mais barato que o
 * tem, para a etiqueta nas funcionalidades; null se todos têm (ou nenhum).
 */
export function planoDoRecurso(planos: PlanoVitrine[], recurso: RecursoPlano): string | null {
  const ordenados = [...planos].sort((a, b) => a.precoMensalCentavos - b.precoMensalCentavos);
  if (ordenados.length === 0 || ordenados.every((p) => p[recurso])) return null;
  return ordenados.find((p) => p[recurso])?.nome ?? null;
}

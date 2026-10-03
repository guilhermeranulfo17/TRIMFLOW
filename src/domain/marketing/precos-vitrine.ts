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

/** Itens do cartão do plano, na ordem de exibição; `incluso = false` aparece riscado/esmaecido. */
export function itensDoPlano(p: PlanoVitrine): { texto: string; incluso: boolean }[] {
  const usuarios = p.maxUsuarios === 1 ? '1 usuário' : `Até ${p.maxUsuarios} usuários`;
  const espacos =
    p.maxEspacos === null
      ? 'Espaços ilimitados'
      : p.maxEspacos === 1
        ? '1 espaço'
        : `Até ${p.maxEspacos} espaços`;
  return [
    { texto: 'Link de orçamento com o seu preço', incluso: true },
    { texto: 'Leads, agenda e propostas em PDF', incluso: true },
    { texto: usuarios, incluso: true },
    { texto: espacos, incluso: true },
    { texto: 'Avisos no WhatsApp', incluso: p.whatsappAvisos },
    { texto: 'Follow-up automático', incluso: p.followUp },
    {
      texto: p.numerosCompleto ? 'Números completos do mês' : 'Números básicos do mês',
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

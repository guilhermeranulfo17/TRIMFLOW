import { pctBp, type Centavos } from '../money';

/*
 * OrkMargem: custos variáveis e margem de contribuição por festa. Tudo em centavos inteiros.
 *
 * - Receita contratada: valor total da reserva (o que foi vendido), não o que já entrou.
 * - Valor recebido: recebimentos do Financeiro (dinheiro que entrou de fato).
 * - Custo previsto: cópia da previsão do pacote para os convidados da festa (editável).
 * - Custo realizado: o que o dono registrou depois da festa.
 * - Margem de contribuição = receita contratada − custos variáveis. NÃO é lucro líquido: custos
 *   fixos e impostos sobre o faturamento ficam de fora.
 */

export const CATEGORIAS_CUSTO = [
  'alimentacao',
  'bebidas',
  'equipe',
  'decoracao',
  'terceiros',
  'descartaveis',
  'taxas',
  'outros',
] as const;
export type CategoriaCusto = (typeof CATEGORIAS_CUSTO)[number];

export const ROTULO_CATEGORIA: Record<CategoriaCusto, string> = {
  alimentacao: 'Alimentação',
  bebidas: 'Bebidas',
  equipe: 'Equipe',
  decoracao: 'Decoração',
  terceiros: 'Terceiros',
  descartaveis: 'Descartáveis',
  taxas: 'Taxas',
  outros: 'Outros custos variáveis',
};

export const ehCategoria = (v: unknown): v is CategoriaCusto =>
  typeof v === 'string' && (CATEGORIAS_CUSTO as readonly string[]).includes(v);

/** Previsão do pacote: por categoria, um valor fixo por festa e um valor por convidado. */
export type CustoPacote = {
  categoria: CategoriaCusto;
  fixoCentavos: Centavos;
  porConvidadoCentavos: Centavos;
};

export type ItemCustoFesta = {
  categoria: CategoriaCusto;
  descricao: string;
  previstoCentavos: Centavos;
  /** null = ainda não registrado */
  realizadoCentavos: Centavos | null;
};

/** Custo previsto de uma categoria para N convidados. */
export const previstoDaCategoria = (c: CustoPacote, convidados: number): Centavos =>
  c.fixoCentavos + c.porConvidadoCentavos * Math.max(0, Math.round(convidados));

/** Copia a previsão do pacote para a festa (só as categorias com valor). */
export function previsaoDaFesta(custos: CustoPacote[], convidados: number): ItemCustoFesta[] {
  return CATEGORIAS_CUSTO.flatMap((categoria) => {
    const c = custos.find((x) => x.categoria === categoria);
    if (!c) return [];
    const previsto = previstoDaCategoria(c, convidados);
    if (previsto <= 0) return [];
    return [
      {
        categoria,
        descricao: ROTULO_CATEGORIA[categoria],
        previstoCentavos: previsto,
        realizadoCentavos: null,
      },
    ];
  });
}

/** Margem em basis points sobre a receita (null sem receita). Arredonda meio para cima. */
export function margemBp(margem: Centavos, receita: Centavos): number | null {
  if (receita <= 0) return null;
  const x = (margem * 10_000) / receita;
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
}

export type ResumoMargem = {
  receitaContratadaCentavos: Centavos;
  recebidoCentavos: Centavos;
  /** contratado − recebido, nunca negativo: a receber, não é dinheiro em caixa */
  aReceberCentavos: Centavos;
  custoPrevistoCentavos: Centavos;
  /** soma só do que já foi registrado */
  custoRealizadoCentavos: Centavos;
  itensSemRealizado: number;
  margemPrevistaCentavos: Centavos;
  margemPrevistaBp: number | null;
  /** null enquanto houver custo sem valor realizado */
  margemRealizadaCentavos: Centavos | null;
  margemRealizadaBp: number | null;
  /** realizado − previsto (positivo = gastou mais), só com todos os realizados */
  diferencaCustoCentavos: Centavos | null;
};

export function resumoMargem(o: {
  receitaContratadaCentavos: Centavos;
  recebidoCentavos: Centavos;
  itens: ItemCustoFesta[];
}): ResumoMargem {
  const receita = Math.max(0, o.receitaContratadaCentavos);
  const previsto = o.itens.reduce((s, i) => s + i.previstoCentavos, 0);
  const realizado = o.itens.reduce((s, i) => s + (i.realizadoCentavos ?? 0), 0);
  const semRealizado = o.itens.filter((i) => i.realizadoCentavos === null).length;
  const completo = o.itens.length > 0 && semRealizado === 0;
  const margemPrevista = receita - previsto;
  const margemRealizada = completo ? receita - realizado : null;
  return {
    receitaContratadaCentavos: receita,
    recebidoCentavos: o.recebidoCentavos,
    aReceberCentavos: Math.max(0, receita - o.recebidoCentavos),
    custoPrevistoCentavos: previsto,
    custoRealizadoCentavos: realizado,
    itensSemRealizado: semRealizado,
    margemPrevistaCentavos: margemPrevista,
    margemPrevistaBp: margemBp(margemPrevista, receita),
    margemRealizadaCentavos: margemRealizada,
    margemRealizadaBp: margemRealizada === null ? null : margemBp(margemRealizada, receita),
    diferencaCustoCentavos: completo ? realizado - previsto : null,
  };
}

export type PendenciaMargem =
  'sem_previsao' | 'sem_receita' | 'custos_sem_realizado' | 'festa_sem_fechamento';

export const TEXTO_PENDENCIA: Record<PendenciaMargem, string> = {
  sem_previsao: 'Sem custos previstos',
  sem_receita: 'Sem valor contratado na reserva',
  custos_sem_realizado: 'Custos sem valor realizado',
  festa_sem_fechamento: 'Festa já aconteceu e não foi fechada',
};

export function pendenciasDaFesta(o: {
  itens: ItemCustoFesta[];
  receitaContratadaCentavos: Centavos;
  festaPassou: boolean;
  fechada: boolean;
}): PendenciaMargem[] {
  const p: PendenciaMargem[] = [];
  if (o.itens.length === 0) p.push('sem_previsao');
  if (o.receitaContratadaCentavos <= 0) p.push('sem_receita');
  if (o.festaPassou && o.itens.some((i) => i.realizadoCentavos === null)) {
    p.push('custos_sem_realizado');
  }
  if (o.festaPassou && !o.fechada) p.push('festa_sem_fechamento');
  return p;
}

/** "Usar o previsto" nos itens sem valor realizado: registrar só as diferenças. */
export const completarComPrevisto = (itens: ItemCustoFesta[]): ItemCustoFesta[] =>
  itens.map((i) =>
    i.realizadoCentavos === null ? { ...i, realizadoCentavos: i.previstoCentavos } : i,
  );

export type FestaComparada = {
  pacote: string | null;
  receitaContratadaCentavos: Centavos;
  custoPrevistoCentavos: Centavos;
  /** null = ainda incompleto */
  custoRealizadoCentavos: Centavos | null;
};

export type ComparacaoPacote = {
  pacote: string;
  festas: number;
  receitaCentavos: Centavos;
  custoPrevistoCentavos: Centavos;
  margemPrevistaBp: number | null;
  /** só das festas com todos os custos realizados */
  festasRealizadas: number;
  margemRealizadaBp: number | null;
};

/** Margem por pacote (festas sem pacote ficam em "Sem pacote"). */
export function compararPacotes(festas: FestaComparada[]): ComparacaoPacote[] {
  const grupos = new Map<string, FestaComparada[]>();
  for (const f of festas) {
    const k = f.pacote ?? 'Sem pacote';
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return [...grupos.entries()]
    .map(([pacote, fs]) => {
      const receita = fs.reduce((s, f) => s + f.receitaContratadaCentavos, 0);
      const previsto = fs.reduce((s, f) => s + f.custoPrevistoCentavos, 0);
      const realizadas = fs.filter((f) => f.custoRealizadoCentavos !== null);
      const receitaR = realizadas.reduce((s, f) => s + f.receitaContratadaCentavos, 0);
      const custoR = realizadas.reduce((s, f) => s + (f.custoRealizadoCentavos ?? 0), 0);
      return {
        pacote,
        festas: fs.length,
        receitaCentavos: receita,
        custoPrevistoCentavos: previsto,
        margemPrevistaBp: margemBp(receita - previsto, receita),
        festasRealizadas: realizadas.length,
        margemRealizadaBp: realizadas.length ? margemBp(receitaR - custoR, receitaR) : null,
      };
    })
    .sort((a, b) => b.receitaCentavos - a.receitaCentavos);
}

/** Valor de exemplo para a demonstração (proporção do total, sem dado real). */
export const custoDeExemplo = (total: Centavos, bp: number): Centavos => pctBp(total, bp);

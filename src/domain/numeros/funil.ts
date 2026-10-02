import { formatPct } from '../percent';
import { razaoBp } from './mediana';
import type { Resumo } from './metricas';

/*
 * Funil do link: visitas → início → leads → orçamentos completos → pré-reservas/visitas →
 * reservas. Visitas e início são sessões do período; as demais etapas são os leads do link
 * criados no período e até onde chegaram (coorte).
 */

export const ETAPAS_FUNIL = [
  { chave: 'visitas', rotulo: 'Visitas ao link' },
  { chave: 'inicios', rotulo: 'Começaram o orçamento' },
  { chave: 'leads', rotulo: 'Deixaram o WhatsApp' },
  { chave: 'completos', rotulo: 'Viram a proposta' },
  { chave: 'preVisitas', rotulo: 'Pediram pré-reserva ou visita' },
  { chave: 'reservas', rotulo: 'Reservaram' },
] as const;

/** Frase da perda entre cada etapa e a seguinte (índice da etapa de origem). */
const PERDAS = [
  (p: string) => `A maior perda está entre a visita e o orçamento: ${p} saem sem começar.`,
  (p: string) => `A maior perda está entre começar o orçamento e deixar o WhatsApp: ${p} desistem.`,
  (p: string) => `A maior perda está entre deixar o WhatsApp e ver a proposta: ${p} param no meio.`,
  (p: string) =>
    `A maior perda está entre ver a proposta e pedir pré-reserva ou visita: ${p} não avançam.`,
  (p: string) => `A maior perda está entre a pré-reserva ou visita e a reserva: ${p} não fecham.`,
];

export type EtapaFunil = {
  chave: (typeof ETAPAS_FUNIL)[number]['chave'];
  rotulo: string;
  quantidade: number;
  /** taxa sobre a etapa anterior, em bp (null na primeira ou com anterior zero) */
  taxaBp: number | null;
};

export function montarFunil(r: Resumo): { etapas: EtapaFunil[]; maiorQueda: string | null } {
  const valores = [
    r.visitas,
    r.inicios,
    r.funilLeads,
    r.funilCompletos,
    r.funilPreVisitas,
    r.funilReservas,
  ];
  const etapas = ETAPAS_FUNIL.map((e, i) => ({
    chave: e.chave,
    rotulo: e.rotulo,
    quantidade: valores[i]!,
    taxaBp: i === 0 ? null : razaoBp(valores[i]!, valores[i - 1]!),
  }));
  // maior queda = menor taxa entre etapas com anterior > 0 (empate: a primeira)
  let pior: number | null = null;
  for (let i = 1; i < etapas.length; i++) {
    const t = etapas[i]!.taxaBp;
    if (t === null) continue;
    if (pior === null || t < etapas[pior]!.taxaBp!) pior = i;
  }
  if (pior === null || etapas[pior]!.taxaBp! >= 10_000) return { etapas, maiorQueda: null };
  const perda = (10_000 - Math.min(10_000, etapas[pior]!.taxaBp!)) / 10_000;
  return { etapas, maiorQueda: PERDAS[pior - 1]!(formatPct(perda)) };
}

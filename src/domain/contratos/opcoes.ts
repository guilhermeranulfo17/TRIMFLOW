import { z } from 'zod';
import { formatBp } from '../percent';

/*
 * Opções do modelo que o dono ajusta sem mexer no texto: multas de cancelamento por prazo,
 * prazo para remarcar e a cláusula de uso de imagem (liga ou desliga). Sugestão padrão abaixo;
 * o modelo diz para revisar com um advogado.
 */

export const faixaCancelamentoSchema = z.object({
  /** a partir de quantos dias antes da festa a faixa vale (0 = até o dia) */
  diasAntes: z.number().int().min(0).max(730),
  /** multa sobre o valor total, em basis points (1% = 100) */
  multaBp: z.number().int().min(0).max(10_000),
});

export const opcoesContratoSchema = z
  .object({
    cancelamento: z.array(faixaCancelamentoSchema).min(1).max(6),
    remarcacaoDias: z.number().int().min(0).max(365),
    usoImagem: z.boolean(),
  })
  .superRefine((o, ctx) => {
    const dias = o.cancelamento.map((f) => f.diasAntes);
    if (new Set(dias).size !== dias.length) {
      ctx.addIssue({ code: 'custom', path: ['cancelamento'], message: 'Prazos repetidos.' });
    }
    if (!dias.includes(0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cancelamento'],
        message: 'Inclua uma faixa para "menos dias" (a partir de 0 dia).',
      });
    }
  });

export type FaixaCancelamento = z.infer<typeof faixaCancelamentoSchema>;
export type OpcoesContrato = z.infer<typeof opcoesContratoSchema>;

export const OPCOES_PADRAO: OpcoesContrato = {
  cancelamento: [
    { diasAntes: 90, multaBp: 1000 },
    { diasAntes: 30, multaBp: 3000 },
    { diasAntes: 0, multaBp: 5000 },
  ],
  remarcacaoDias: 30,
  usoImagem: false,
};

/** Opções guardadas (jsonb) com fallback para o padrão no que estiver ausente ou inválido. */
export function lerOpcoes(bruto: unknown): OpcoesContrato {
  const r = opcoesContratoSchema.safeParse({ ...OPCOES_PADRAO, ...(bruto as object | null) });
  return r.success ? r.data : OPCOES_PADRAO;
}

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/**
 * Faixas em ordem (mais antecedência primeiro), em linhas de lista:
 * - Com 90 dias ou mais de antecedência: multa de 10% do valor total.
 * - De 30 a 89 dias: multa de 30% do valor total.
 * - Com menos de 30 dias: multa de 50% do valor total.
 */
export function textoCancelamento(faixas: FaixaCancelamento[]): string {
  const ordem = [...faixas].sort((a, b) => b.diasAntes - a.diasAntes);
  return ordem
    .map((f, i) => {
      const multa =
        f.multaBp === 0 ? 'sem multa' : `multa de ${formatBp(f.multaBp)} do valor total`;
      const anterior = ordem[i - 1];
      let prazo: string;
      if (i === 0 && f.diasAntes > 0) prazo = `Com ${dias(f.diasAntes)} ou mais de antecedência`;
      else if (f.diasAntes === 0) {
        prazo = anterior ? `Com menos de ${dias(anterior.diasAntes)}` : 'A qualquer momento';
      } else prazo = `De ${f.diasAntes} a ${anterior!.diasAntes - 1} dias`;
      return `- ${prazo}: ${multa}.`;
    })
    .join('\n');
}

/** Menor prazo sem a maior multa, para a frase "cancelar com pelo menos X dias". */
export function menorPrazoCancelamento(faixas: FaixaCancelamento[]): number {
  const positivos = faixas.map((f) => f.diasAntes).filter((d) => d > 0);
  return positivos.length ? Math.min(...positivos) : 0;
}

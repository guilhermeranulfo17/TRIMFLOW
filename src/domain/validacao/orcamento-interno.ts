import { z } from 'zod';
import { ORIGENS_INTERNAS } from './origens';
import { escolhasSchema } from './publico';

/*
 * Orçamento interno ("+ Orçamento"): o painel manda escolhas, ajustes e o cliente. O preço é
 * recalculado no servidor (canal interno), com o limite de desconto do usuário vindo do banco.
 */

export { ORIGENS_INTERNAS };

export const ajustesInternosSchema = z.object({
  avulsos: z
    .array(
      z.object({
        descricao: z
          .string()
          .trim()
          .min(1, 'Descreva o item.')
          .max(120, 'Use no máximo 120 caracteres.'),
        quantidade: z.number().int().min(1).max(10_000),
        valorUnitarioCentavos: z.number().int().min(0).max(100_000_000),
      }),
    )
    .max(30)
    .default([]),
  desconto: z
    .discriminatedUnion('tipo', [
      z.object({ tipo: z.literal('percentual'), bp: z.number().int().min(0).max(10_000) }),
      z.object({ tipo: z.literal('valor'), centavos: z.number().int().min(0).max(1_000_000_000) }),
    ])
    .nullable()
    .default(null),
  descontoMotivo: z.string().trim().max(200, 'Use no máximo 200 caracteres.').default(''),
  observacoes: z.string().trim().max(1000, 'Use no máximo 1000 caracteres.').default(''),
  observacoesInternas: z.string().trim().max(1000, 'Use no máximo 1000 caracteres.').default(''),
  foraAntecedencia: z.boolean().default(false),
});

export const orcamentoInternoSchema = z.object({
  orcamentoId: z.uuid().optional(),
  cliente: z.object({
    whatsapp: z.string().trim().min(1, 'Informe o WhatsApp do cliente.'),
    nome: z.string().trim().min(2, 'Informe o nome do cliente.').max(120),
    origem: z.enum(['instagram', 'google', 'indicacao', 'whatsapp', 'outro']).default('whatsapp'),
  }),
  escolhas: escolhasSchema,
  ajustes: ajustesInternosSchema,
});

/** Prévia (recalcular a cada mudança): só escolhas e ajustes, sem cliente. */
export const previaInternaSchema = orcamentoInternoSchema.pick({ escolhas: true, ajustes: true });

export type PreviaInternaEntrada = z.input<typeof previaInternaSchema>;
export type OrcamentoInternoEntrada = z.input<typeof orcamentoInternoSchema>;
export type OrcamentoInterno = z.output<typeof orcamentoInternoSchema>;
export type AjustesInternos = z.output<typeof ajustesInternosSchema>;

export type EstadoInterno = {
  escolhas: z.output<typeof escolhasSchema>;
  ajustes: AjustesInternos;
};

const ESCOLHAS_VAZIAS: EstadoInterno['escolhas'] = { criancas: [], opcionais: [], horasExtras: 0 };

/**
 * Formulário a partir de uma versão gravada (nova versão de um orçamento). O rascunho de um
 * orçamento interno guarda as escolhas e, em `interno`, os ajustes; o do link só as escolhas.
 * Observações e motivo vêm das colunas (valem mais que o rascunho). Lixo vira formulário vazio.
 */
export function estadoDaVersao(
  rascunho: unknown,
  colunas: {
    observacoes?: string | null;
    observacoesInternas?: string | null;
    descontoMotivo?: string | null;
    foraAntecedencia?: boolean;
  } = {},
): EstadoInterno {
  const r = (rascunho && typeof rascunho === 'object' ? rascunho : {}) as Record<string, unknown>;
  const escolhas = escolhasSchema.safeParse(r);
  const ajustes = ajustesInternosSchema.safeParse(r.interno ?? {});
  const base = ajustes.success ? ajustes.data : ajustesInternosSchema.parse({});
  return {
    escolhas: escolhas.success ? escolhas.data : ESCOLHAS_VAZIAS,
    ajustes: {
      ...base,
      observacoes: colunas.observacoes ?? base.observacoes,
      observacoesInternas: colunas.observacoesInternas ?? base.observacoesInternas,
      descontoMotivo: colunas.descontoMotivo ?? base.descontoMotivo,
      foraAntecedencia: colunas.foraAntecedencia ?? base.foraAntecedencia,
    },
  };
}

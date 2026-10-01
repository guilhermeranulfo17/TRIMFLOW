import { z } from 'zod';
import { escolhasSchema } from './publico';

/*
 * Orçamento interno ("+ Orçamento"): o painel manda escolhas, ajustes e o cliente. O preço é
 * recalculado no servidor (canal interno), com o limite de desconto do usuário vindo do banco.
 */

export const ORIGENS_INTERNAS = [
  { valor: 'instagram', rotulo: 'Instagram' },
  { valor: 'google', rotulo: 'Google' },
  { valor: 'indicacao', rotulo: 'Indicação' },
  { valor: 'whatsapp', rotulo: 'WhatsApp' },
  { valor: 'outro', rotulo: 'Outro' },
] as const;

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

export type OrcamentoInternoEntrada = z.input<typeof orcamentoInternoSchema>;
export type OrcamentoInterno = z.output<typeof orcamentoInternoSchema>;
export type AjustesInternos = z.output<typeof ajustesInternosSchema>;

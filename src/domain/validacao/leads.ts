import { z } from 'zod';
import { CODIGOS_MOTIVO_PERDA } from '../leads/motivos-perda';

/*
 * Entradas das ações do vendedor no lead (painel). Datas e horas chegam como texto do campo
 * (ex.: "2026-11-14T15:00" ou "amanhã 9h") e o servidor converte no fuso da empresa.
 */

export const CANAIS_CONTATO = [
  { valor: 'whatsapp', rotulo: 'WhatsApp' },
  { valor: 'ligacao', rotulo: 'Ligação' },
  { valor: 'presencial', rotulo: 'Pessoalmente' },
] as const;

export const contatoSchema = z.object({
  canal: z.enum(['whatsapp', 'ligacao', 'presencial']),
  resumo: z.string().trim().max(500, 'Use no máximo 500 caracteres.').default(''),
});

export const notaSchema = z.object({
  texto: z.string().trim().min(1, 'Escreva a nota.').max(2000, 'Use no máximo 2000 caracteres.'),
});

const quando = z
  .string({ error: 'Escolha o dia e a hora.' })
  .trim()
  .min(1, 'Escolha o dia e a hora.')
  .max(40);

export const tarefaSchema = z.object({
  titulo: z.string().trim().min(1, 'Descreva a tarefa.').max(160, 'Use no máximo 160 caracteres.'),
  quando,
  descricao: z.string().trim().max(1000, 'Use no máximo 1000 caracteres.').default(''),
});

export const adiarSchema = z.union([
  z.object({ opcao: z.enum(['em_1_hora', 'amanha_9h', 'em_3_dias', 'proxima_semana']) }),
  z.object({ quando }),
]);

export const proximoContatoSchema = z.object({ quando });

export const perdidoSchema = z
  .object({
    motivo: z.enum(CODIGOS_MOTIVO_PERDA as [string, ...string[]], { error: 'Escolha o motivo.' }),
    detalhe: z.string().trim().max(300, 'Use no máximo 300 caracteres.').default(''),
  })
  .refine((p) => p.motivo !== 'outro' || p.detalhe.length > 0, {
    message: 'Conte o motivo em poucas palavras.',
    path: ['detalhe'],
  });

export const visitaSchema = z.object({
  quando,
  observacoes: z.string().trim().max(500, 'Use no máximo 500 caracteres.').default(''),
});

export const dadosLeadSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.').max(120, 'Use no máximo 120 caracteres.'),
  email: z.union([z.literal(''), z.email('E-mail inválido.').max(200)]).default(''),
});

export type ContatoEntrada = z.input<typeof contatoSchema>;
export type NotaEntrada = z.input<typeof notaSchema>;
export type TarefaEntrada = z.input<typeof tarefaSchema>;
export type AdiarEntrada = z.input<typeof adiarSchema>;
export type PerdidoEntrada = z.input<typeof perdidoSchema>;
export type VisitaEntrada = z.input<typeof visitaSchema>;
export type DadosLeadEntrada = z.input<typeof dadosLeadSchema>;

import { z } from 'zod';
import { idSchema } from './comum';

/*
 * Fronteira do link público: o navegador manda só escolhas e o contato. Tudo o mais (preço,
 * "hoje", desconto, modo teste) é decidido no servidor.
 */

const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const quantidade = z.number().int().min(0).max(10_000);

export const escolhasSchema = z.object({
  tipoEventoId: idSchema.optional(),
  data: dataCivil.optional(),
  turnoId: idSchema.optional(),
  espacoId: idSchema.optional(),
  adultos: z.number().int().min(0).max(10_000).optional(),
  criancas: z
    .array(z.object({ faixaIdadeId: idSchema, quantidade }))
    .max(20)
    .default([]),
  localCliente: z.string().trim().max(120).optional(),
  pacoteId: idSchema.optional(),
  opcionais: z
    .array(z.object({ opcionalId: idSchema, quantidade }))
    .max(50)
    .default([]),
  horasExtras: z.number().int().min(0).max(12).default(0),
});

export type EscolhasEntrada = z.input<typeof escolhasSchema>;

/** Versão do texto de consentimento gravada no lead (mude quando o texto mudar). */
export const VERSAO_CONSENTIMENTO = '2026-10-v1';
export const TEXTO_CONSENTIMENTO =
  'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento e falar comigo sobre a festa, conforme a Política de Privacidade.';

export const contatoSchema = z.object({
  nome: z
    .string({ error: 'Informe seu nome.' })
    .trim()
    .min(2, 'Informe seu nome.')
    .max(120, 'Use no máximo 120 caracteres.'),
  /** só dígitos com DDD; o servidor converte para E.164 e confere se é celular */
  whatsapp: z.string({ error: 'Informe seu WhatsApp.' }).trim().min(1, 'Informe seu WhatsApp.'),
  aceite: z.literal(true, { error: 'Para continuar, aceite a Política de Privacidade.' }),
  /** honeypot: campo invisível; pessoas deixam vazio */
  site: z.string().max(200).optional(),
  /** instante assinado em que o formulário apareceu (tempo mínimo de preenchimento) */
  inicio: z.string().max(200).optional(),
});

export type ContatoEntrada = z.input<typeof contatoSchema>;

export const visitaSchema = z.object({
  dataPreferida: dataCivil,
  periodo: z.enum(['manha', 'tarde', 'noite'], { error: 'Escolha o período.' }),
  observacoes: z.string().trim().max(500, 'Use no máximo 500 caracteres.').optional(),
});

export type VisitaEntrada = z.input<typeof visitaSchema>;

export const funilSchema = z.object({
  sessao: z.uuid(),
  passo: z.number().int().min(0).max(6),
  evento: z.enum(['passo_visto', 'passo_concluido', 'abandono']),
  origem: z.string().max(40).optional(),
});

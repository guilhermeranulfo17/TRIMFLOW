import { z } from 'zod';
import { celularBRParaE164 } from '../phone';
import { bp, nomeCurto } from './comum';

export const novoVendedorSchema = z.object({
  nome: nomeCurto('o nome', 120).refine((v) => v.length >= 2, 'Informe o nome.'),
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail.')
    .max(254)
    .pipe(z.email('E-mail inválido.'))
    .transform((v) => v.toLowerCase()),
  whatsapp: z
    .string()
    .trim()
    .min(1, 'Informe o WhatsApp.')
    .refine((v) => celularBRParaE164(v) !== null, 'Informe um celular válido com DDD.'),
  limiteDescontoBp: bp(0, 10_000, 'o limite de desconto'),
});
export type NovoVendedorEntrada = z.input<typeof novoVendedorSchema>;
export type NovoVendedorSaida = z.output<typeof novoVendedorSchema>;

export const limiteDescontoSchema = z.object({
  limiteDescontoBp: bp(0, 10_000, 'o limite de desconto'),
});

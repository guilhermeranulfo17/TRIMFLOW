import { z } from 'zod';
import { celularBRParaE164 } from '../phone';
import { email, senha } from './auth';

/** Cadastro do dono. Separado de ./auth para o login não carregar a validação de telefone. */

export const SEGMENTOS = ['infantil', 'eventos', 'domicilio'] as const;
export type Segmento = (typeof SEGMENTOS)[number];

export const ROTULO_SEGMENTO: Record<Segmento, string> = {
  infantil: 'Buffet infantil',
  eventos: 'Casamento e eventos',
  domicilio: 'Buffet em domicílio',
};

export const cadastroSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(120, 'Nome muito longo'),
  email,
  whatsapp: z
    .string()
    .trim()
    .min(1, 'Informe seu WhatsApp')
    .refine((v) => celularBRParaE164(v) !== null, 'Informe um celular válido com DDD'),
  senha,
  nomeBuffet: z.string().trim().min(2, 'Informe o nome do buffet').max(120, 'Nome muito longo'),
  segmento: z.enum(SEGMENTOS, { error: 'Escolha o tipo de buffet' }),
});
export type CadastroInput = z.input<typeof cadastroSchema>;

import { z } from 'zod';
import { celularBRParaE164 } from '../phone';
import { SEGMENTOS } from '../segmento';
import { email, senha } from './auth';

/** Cadastro do dono. Separado de ./auth para o login não carregar a validação de telefone. */

export { ROTULO_SEGMENTO, SEGMENTOS, type Segmento } from '../segmento';

const dadosDoBuffet = {
  nome: z.string().trim().min(2, 'Informe seu nome').max(120, 'Nome muito longo'),
  nomeBuffet: z.string().trim().min(2, 'Informe o nome do buffet').max(120, 'Nome muito longo'),
  whatsapp: z
    .string()
    .trim()
    .min(1, 'Informe seu WhatsApp')
    .refine((v) => celularBRParaE164(v) !== null, 'Informe um celular válido com DDD'),
  segmento: z.enum(SEGMENTOS, { error: 'Escolha o tipo de buffet' }),
  aceite: z.boolean().refine((v) => v, 'Para criar a conta, aceite os termos de uso.'),
};

export const cadastroSchema = z.object({ ...dadosDoBuffet, email, senha });
export type CadastroInput = z.input<typeof cadastroSchema>;

/** Quem entrou pelo Google completa só os dados do buffet (e-mail e senha vêm do Google). */
export const completarSchema = z.object(dadosDoBuffet);
export type CompletarInput = z.input<typeof completarSchema>;

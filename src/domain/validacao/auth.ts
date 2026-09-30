import { z } from 'zod';
import { celularBRParaE164 } from '../phone';

/** Schemas compartilhados entre formulários (cliente) e server actions (servidor). */

export const SEGMENTOS = ['infantil', 'eventos', 'domicilio'] as const;
export type Segmento = (typeof SEGMENTOS)[number];

export const ROTULO_SEGMENTO: Record<Segmento, string> = {
  infantil: 'Buffet infantil',
  eventos: 'Casamento e eventos',
  domicilio: 'Buffet em domicílio',
};

const email = z
  .string()
  .trim()
  .min(1, 'Informe seu e-mail')
  .max(254, 'E-mail muito longo')
  .pipe(z.email('E-mail inválido'))
  .transform((v) => v.toLowerCase());

const senha = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .max(72, 'A senha pode ter no máximo 72 caracteres');

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

export const loginSchema = z.object({
  email,
  senha: z.string().min(1, 'Informe sua senha'),
});
export type LoginInput = z.input<typeof loginSchema>;

export const recuperarSenhaSchema = z.object({ email });
export type RecuperarSenhaInput = z.input<typeof recuperarSenhaSchema>;

export const novaSenhaSchema = z
  .object({
    senha,
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, {
    message: 'As senhas não conferem',
    path: ['confirmacao'],
  });
export type NovaSenhaInput = z.input<typeof novaSenhaSchema>;

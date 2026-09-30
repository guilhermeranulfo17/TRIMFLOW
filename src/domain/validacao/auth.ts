import { z } from 'zod';

/** Schemas compartilhados entre formulários (cliente) e server actions (servidor). */

export const email = z
  .string()
  .trim()
  .min(1, 'Informe seu e-mail')
  .max(254, 'E-mail muito longo')
  .pipe(z.email('E-mail inválido'))
  .transform((v) => v.toLowerCase());

export const senha = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .max(72, 'A senha pode ter no máximo 72 caracteres');

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

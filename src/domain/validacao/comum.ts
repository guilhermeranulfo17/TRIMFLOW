import { z } from 'zod';
import type { Problema } from '../catalogo/validacoes';

/** Blocos reutilizáveis dos schemas de configuração (mensagens em português simples). */

export const idSchema = z.uuid({ error: 'Registro inválido.' });

export const nomeCurto = (rotulo = 'o nome', max = 80) =>
  z
    .string({ error: `Informe ${rotulo}.` })
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .max(max, `Use no máximo ${max} caracteres.`);

export const textoOpcional = (max: number) =>
  z.string().trim().max(max, `Use no máximo ${max} caracteres.`);

export const inteiro = (rotulo: string, min: number, max: number) =>
  z
    .number({ error: `Informe ${rotulo}.` })
    .int(`Use um número inteiro para ${rotulo}.`)
    .min(min, `${rotulo[0]!.toUpperCase()}${rotulo.slice(1)} precisa ser pelo menos ${min}.`)
    .max(max, `${rotulo[0]!.toUpperCase()}${rotulo.slice(1)} pode ser no máximo ${max}.`);

export const centavos = (rotulo = 'o valor') =>
  z
    .number({ error: `Informe ${rotulo}.` })
    .int(`Informe ${rotulo} em reais.`)
    .min(0, `${rotulo[0]!.toUpperCase()}${rotulo.slice(1)} não pode ser negativo.`)
    .max(100_000_000, 'Valor alto demais.');

export const bp = (min: number, max: number, rotulo = 'o percentual') =>
  z
    .number({ error: `Informe ${rotulo}.` })
    .int()
    .min(min, `Use um percentual entre ${min / 100}% e ${max / 100}%.`)
    .max(max, `Use um percentual entre ${min / 100}% e ${max / 100}%.`);

export const dataCivil = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data válida.')
  .refine((d) => {
    const [a, m, dia] = d.split('-').map(Number) as [number, number, number];
    const utc = new Date(Date.UTC(a, m - 1, dia));
    return utc.getUTCFullYear() === a && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === dia;
  }, 'Informe uma data válida.');

/** Converte problemas das validações de negócio em issues do Zod, no campo certo. */
export function adicionarProblemas(ctx: z.RefinementCtx, problemas: Problema[]) {
  for (const p of problemas) {
    ctx.addIssue({
      code: 'custom',
      message: p.mensagem,
      path: p.campo.split('.').map((parte) => (/^\d+$/.test(parte) ? Number(parte) : parte)),
    });
  }
}

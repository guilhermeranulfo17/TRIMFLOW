import { z } from 'zod';
import { toE164 } from '../phone';
import { dataCivil, nomeCurto, textoOpcional } from '../validacao/comum';

/*
 * Lead de vendas do Orkestra (dono de buffet prospectado). Validação compartilhada entre o
 * formulário e a server action. Etapa e tentativas não entram aqui: a etapa muda pelo pipeline
 * (com motivo) e as tentativas pelo copiloto.
 */

const vazioParaNull = (v: string) => (v === '' ? null : v);

export const leadVendasSchema = z.object({
  nome: nomeCurto('o nome', 120).refine((v) => v.length >= 2, 'Informe o nome.'),
  buffet: textoOpcional(160).transform(vazioParaNull),
  telefone: z
    .string()
    .trim()
    .refine((v) => v === '' || toE164(v, 'BR') !== null, 'Informe um telefone válido com DDD.')
    .transform((v) => (v === '' ? null : toE164(v, 'BR'))),
  cidade: textoOpcional(120).transform(vazioParaNull),
  origem: textoOpcional(80).transform(vazioParaNull),
  resumo: textoOpcional(2000).transform(vazioParaNull),
  proximoFollowup: z.union([z.literal(''), dataCivil]).transform(vazioParaNull),
  naoContatar: z.boolean(),
});
export type LeadVendasEntrada = z.input<typeof leadVendasSchema>;
export type LeadVendasDados = z.output<typeof leadVendasSchema>;

export const LEAD_VAZIO: LeadVendasEntrada = {
  nome: '',
  buffet: '',
  telefone: '',
  cidade: '',
  origem: '',
  resumo: '',
  proximoFollowup: '',
  naoContatar: false,
};

/** Busca da lista: casa nome, buffet, cidade ou os dígitos do telefone, sem acento. */
export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

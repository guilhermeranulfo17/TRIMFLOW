import { z } from 'zod';
import { cnpjValido } from './cnpj';
import { toE164 } from '../phone';
import { SLUG_MAX, SLUG_MIN, SLUG_REGEX } from '../slug';
import { nomeCurto, textoOpcional } from './comum';

export const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

/** Fusos oferecidos na interface (todos do Brasil). O banco aceita qualquer fuso válido. */
export const FUSOS_BR = [
  { valor: 'America/Sao_Paulo', rotulo: 'Brasília (SP, RJ, MG, Sul, Nordeste…)' },
  { valor: 'America/Manaus', rotulo: 'Amazonas (Manaus)' },
  { valor: 'America/Cuiaba', rotulo: 'Mato Grosso (Cuiabá)' },
  { valor: 'America/Campo_Grande', rotulo: 'Mato Grosso do Sul (Campo Grande)' },
  { valor: 'America/Porto_Velho', rotulo: 'Rondônia (Porto Velho)' },
  { valor: 'America/Boa_Vista', rotulo: 'Roraima (Boa Vista)' },
  { valor: 'America/Rio_Branco', rotulo: 'Acre (Rio Branco)' },
  { valor: 'America/Belem', rotulo: 'Pará e Amapá (Belém)' },
  { valor: 'America/Fortaleza', rotulo: 'Ceará e vizinhos (Fortaleza)' },
  { valor: 'America/Recife', rotulo: 'Pernambuco (Recife)' },
  { valor: 'America/Bahia', rotulo: 'Bahia (Salvador)' },
  { valor: 'America/Noronha', rotulo: 'Fernando de Noronha' },
] as const;

export const COR_PADRAO = '#7C5CD6';

export const identidadeSchema = z.object({
  nome: nomeCurto('o nome do buffet', 120).refine(
    (v) => v.length >= 2,
    'Informe o nome do buffet.',
  ),
  whatsappE164: z
    .string()
    .trim()
    .min(1, 'Informe o WhatsApp do buffet.')
    .refine((v) => toE164(v, 'BR') !== null, 'Informe um telefone válido com DDD.'),
  email: z.union([z.literal(''), z.email('E-mail inválido.').max(254)]),
  cidade: textoOpcional(120),
  uf: z.union([z.literal(''), z.enum(UFS, { error: 'Escolha o estado.' })]),
  fuso: z.string().min(1, 'Escolha o fuso horário.').max(64),
  corMarca: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use uma cor no formato #RRGGBB.'),
  sobre: textoOpcional(600),
});
export type IdentidadeEntrada = z.input<typeof identidadeSchema>;

/** Dados do rodapé da proposta (razão social, CNPJ e endereço; todos opcionais). */
export const dadosPropostaSchema = z.object({
  razaoSocial: textoOpcional(160),
  cnpj: z
    .string()
    .trim()
    .refine((v) => v === '' || cnpjValido(v), 'CNPJ inválido. Confira os números.'),
  endereco: textoOpcional(200),
});
export type DadosPropostaEntrada = z.input<typeof dadosPropostaSchema>;

export const slugSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(SLUG_MIN, `Use pelo menos ${SLUG_MIN} caracteres.`)
    .max(SLUG_MAX, `Use no máximo ${SLUG_MAX} caracteres.`)
    .regex(
      SLUG_REGEX,
      'Use só letras minúsculas sem acento, números e hífen (ex.: buffet-alegria).',
    ),
});
export type SlugEntrada = z.input<typeof slugSchema>;

export const TIPOS_IMAGEM = ['logo', 'capa', 'pacotes'] as const;
export type TipoImagem = (typeof TIPOS_IMAGEM)[number];

/** Caminho de uma imagem no bucket "midia", sempre dentro da pasta da empresa. */
export function caminhoImagemValido(caminho: string, empresaId: string, tipo: TipoImagem): boolean {
  return new RegExp(`^${empresaId}/${tipo}/[0-9a-f-]{36}\\.webp$`).test(caminho);
}

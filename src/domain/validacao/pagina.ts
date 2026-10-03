import { z } from 'zod';
import { diferenciaisValidos, ESTILOS, LIMITES_PAGINA as L } from '../publico/pagina';
import { textoOpcional } from './comum';

/** Schemas do editor da página pública (Minha empresa → Link). Os limites valem também no banco. */

export const textosPaginaSchema = z.object({
  slogan: textoOpcional(L.slogan),
  estilo: z.union([z.literal(''), z.enum(ESTILOS)]),
  diferenciais: z
    .array(
      z
        .string()
        .trim()
        .min(L.diferencialMin, `Use pelo menos ${L.diferencialMin} caracteres.`)
        .max(L.diferencialMax, `Use no máximo ${L.diferencialMax} caracteres.`),
    )
    .max(L.diferenciais, `Use no máximo ${L.diferenciais} diferenciais.`)
    .refine(diferenciaisValidos, 'Há diferenciais repetidos.'),
  bairro: textoOpcional(L.bairro),
  endereco: textoOpcional(300),
  mostrarEndereco: z.boolean(),
});
export type TextosPaginaEntrada = z.input<typeof textosPaginaSchema>;

const CAMINHO = (largura: 640 | 1280) =>
  new RegExp(`^[0-9a-f-]{36}/galeria/[0-9a-f-]{36}-${largura}\\.webp$`);

export const fotoGaleriaSchema = z.object({
  caminho640: z.string().regex(CAMINHO(640), 'Foto inválida.'),
  caminho1280: z.string().regex(CAMINHO(1280), 'Foto inválida.'),
  largura: z.number().int().min(1).max(4000),
  altura: z.number().int().min(1).max(4000),
  blur: z.string().max(2000).startsWith('data:image/').nullable().optional(),
  alt: textoOpcional(L.altFoto),
});
export const galeriaSchema = z
  .array(fotoGaleriaSchema)
  .max(L.galeria, `A galeria aceita até ${L.galeria} fotos.`);
export type FotoGaleriaEntrada = z.input<typeof fotoGaleriaSchema>;

export const depoimentoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe o nome do cliente.')
    .max(L.depoimentoNome, `Use no máximo ${L.depoimentoNome} caracteres.`),
  tipoFesta: textoOpcional(L.depoimentoTipo),
  texto: z
    .string()
    .trim()
    .min(L.depoimentoTextoMin, `Escreva pelo menos ${L.depoimentoTextoMin} caracteres.`)
    .max(L.depoimentoTexto, `Use no máximo ${L.depoimentoTexto} caracteres.`),
});
export const depoimentosSchema = z.object({
  itens: z
    .array(depoimentoSchema)
    .max(L.depoimentos, `Cadastre no máximo ${L.depoimentos} depoimentos.`),
});
export type DepoimentosEntrada = z.input<typeof depoimentosSchema>;

export const perguntaSchema = z.object({
  pergunta: z
    .string()
    .trim()
    .min(L.perguntaMin, 'Escreva a pergunta.')
    .max(L.pergunta, `Use no máximo ${L.pergunta} caracteres.`),
  resposta: z
    .string()
    .trim()
    .min(2, 'Escreva a resposta.')
    .max(L.resposta, `Use no máximo ${L.resposta} caracteres.`),
});
export const perguntasSchema = z.object({
  itens: z.array(perguntaSchema).max(L.perguntas, `Cadastre no máximo ${L.perguntas} perguntas.`),
});
export type PerguntasEntrada = z.input<typeof perguntasSchema>;

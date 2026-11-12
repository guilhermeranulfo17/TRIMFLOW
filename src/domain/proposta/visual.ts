/*
 * Modelo visual da proposta (web e PDF). O dono escolhe em Minha empresa; sem escolha, vale o
 * padrão do tipo de buffet: infantil = alegre, espaço de eventos e domicílio = elegante.
 * É identidade (lida ao vivo), não condição comercial: trocar vale também para propostas já
 * enviadas, como a cor e o logo.
 */

export const MODELOS_VISUAIS = ['elegante', 'alegre'] as const;
export type ModeloVisual = (typeof MODELOS_VISUAIS)[number];
type SegmentoBuffet = 'infantil' | 'eventos' | 'domicilio';

export const ROTULO_MODELO_VISUAL: Record<ModeloVisual, { nome: string; descricao: string }> = {
  elegante: {
    nome: 'Elegante',
    descricao:
      'Para casamento, 15 anos e corporativo: capa, muito espaço em branco, títulos finos e linhas delicadas.',
  },
  alegre: {
    nome: 'Alegre',
    descricao: 'Para festa infantil: faixas na cor da marca, cantos arredondados e títulos fortes.',
  },
};

const PADRAO_DO_SEGMENTO: Record<SegmentoBuffet, ModeloVisual> = {
  infantil: 'alegre',
  eventos: 'elegante',
  domicilio: 'elegante',
};

export function modeloVisualValido(v: unknown): v is ModeloVisual {
  return typeof v === 'string' && (MODELOS_VISUAIS as readonly string[]).includes(v);
}

/** Padrão do tipo de buffet (segmento desconhecido = elegante). */
export function modeloVisualDoSegmento(segmento: string | null | undefined): ModeloVisual {
  return PADRAO_DO_SEGMENTO[segmento as SegmentoBuffet] ?? 'elegante';
}

/** Escolha do dono ou, sem escolha (ou valor inválido), o padrão do tipo de buffet. */
export function modeloVisualEfetivo(
  escolha: string | null | undefined,
  segmento: string | null | undefined,
): ModeloVisual {
  return modeloVisualValido(escolha) ? escolha : modeloVisualDoSegmento(segmento);
}

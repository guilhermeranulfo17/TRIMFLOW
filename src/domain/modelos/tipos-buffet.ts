import type { Segmento } from '../segmento';

/*
 * Tipos de buffet que o dono escolhe no cadastro (§90). Módulo leve (sem os catálogos), para o
 * formulário do navegador. Cada tipo é um modelo do onboarding (MODELOS_ONBOARDING) e grava o
 * segmento da empresa; "casamento" usa o segmento "eventos" com catálogo próprio.
 */

export const TIPOS_BUFFET = ['infantil', 'casamento', 'eventos', 'domicilio'] as const;
export type TipoBuffet = (typeof TIPOS_BUFFET)[number];

export const INFO_TIPO_BUFFET: Record<
  TipoBuffet,
  { rotulo: string; dica: string; segmento: Segmento }
> = {
  infantil: { rotulo: 'Buffet infantil', dica: 'Aniversários de criança', segmento: 'infantil' },
  casamento: {
    rotulo: 'Casamento e 15 anos',
    dica: 'Recepção, jantar e bem-casados',
    segmento: 'eventos',
  },
  eventos: {
    rotulo: 'Espaço de eventos',
    dica: 'Formaturas, empresas e festas em geral',
    segmento: 'eventos',
  },
  domicilio: {
    rotulo: 'Buffet em domicílio',
    dica: 'Vou até a casa do cliente',
    segmento: 'domicilio',
  },
};

export function segmentoDoTipo(tipo: TipoBuffet): Segmento {
  return INFO_TIPO_BUFFET[tipo].segmento;
}

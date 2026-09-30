/** Segmentos de buffet atendidos. O segmento escolhe o modelo de catálogo de exemplo. */
export const SEGMENTOS = ['infantil', 'eventos', 'domicilio'] as const;
export type Segmento = (typeof SEGMENTOS)[number];

export const ROTULO_SEGMENTO: Record<Segmento, string> = {
  infantil: 'Buffet infantil',
  eventos: 'Casamento e eventos',
  domicilio: 'Buffet em domicílio',
};

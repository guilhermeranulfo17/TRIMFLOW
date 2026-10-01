/** Como o cliente chegou (orçamento interno). Sem Zod: a tela importa sem pesar no bundle. */
export const ORIGENS_INTERNAS = [
  { valor: 'instagram', rotulo: 'Instagram' },
  { valor: 'google', rotulo: 'Google' },
  { valor: 'indicacao', rotulo: 'Indicação' },
  { valor: 'whatsapp', rotulo: 'WhatsApp' },
  { valor: 'outro', rotulo: 'Outro' },
] as const;

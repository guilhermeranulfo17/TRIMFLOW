import type { Escolhas, Previa, VitrinePublica } from '@/domain/publico';

/** O que cada passo recebe do wizard. */
export type PropsPasso = {
  slug: string;
  vitrine: VitrinePublica;
  escolhas: Escolhas;
  alterar: (parcial: Partial<Escolhas>) => void;
  previa: Previa | null;
  carregando: boolean;
  buffet: { nome: string; whatsappE164: string | null };
};

export type Contato = { nome: string; whatsapp: string; aceite: boolean; site: string };

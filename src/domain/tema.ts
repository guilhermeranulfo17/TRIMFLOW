/** Tema do painel (cookie orkestra_tema). Padrão: escuro. "sistema" segue o aparelho. */
export const TEMAS = ['escuro', 'claro', 'sistema'] as const;
export type Tema = (typeof TEMAS)[number];

export const COOKIE_TEMA = 'orkestra_tema';

export function temaValido(valor: string | null | undefined): Tema {
  return (TEMAS as readonly string[]).includes(valor ?? '') ? (valor as Tema) : 'escuro';
}

export const ROTULO_TEMA: Record<Tema, string> = {
  escuro: 'Escuro',
  claro: 'Claro',
  sistema: 'Seguir o sistema',
};

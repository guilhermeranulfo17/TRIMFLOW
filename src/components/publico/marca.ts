import type { CSSProperties } from 'react';
import { coresDaMarca } from '@/domain/publico';

/**
 * Variáveis CSS com a cor do buffet. Sobrescrevem --primary/--ring/--accent dentro da página
 * pública, então botões e foco usam a identidade do buffet (com contraste AA garantido).
 */
export function estiloDaMarca(cor: string | null | undefined): CSSProperties {
  const c = coresDaMarca(cor);
  return {
    '--primary': c.base,
    '--primary-foreground': c.texto,
    '--primary-hover': c.destaque,
    // texto e ícones na cor do buffet: a versão com 4,5:1 sobre o branco
    '--primary-texto': c.destaque,
    '--ring': c.destaque,
    '--accent': c.suave,
    '--accent-foreground': c.destaque,
    '--marca-destaque': c.destaque,
    '--background': '#ffffff',
  } as CSSProperties;
}

/** Classes dos botões da página pública (sem depender de componente cliente). */
export const BOTAO_PRINCIPAL =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-5 text-base font-bold text-primary-foreground transition-colors hover:bg-[var(--primary-hover)] hover:text-white focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';
export const BOTAO_SECUNDARIO =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-control border border-input bg-white px-5 text-base font-semibold text-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

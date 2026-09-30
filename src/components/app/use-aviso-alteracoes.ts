'use client';

import { useEffect } from 'react';

const MENSAGEM = 'Há alterações não salvas. Sair mesmo assim?';

/**
 * Enquanto `sujo` for verdadeiro, avisa antes de perder alterações: ao fechar/recarregar a aba
 * (beforeunload) e ao clicar em links internos (confirmação antes de navegar).
 */
export function useAvisoAlteracoes(sujo: boolean) {
  useEffect(() => {
    if (!sujo) return;
    const antesDeSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = MENSAGEM;
    };
    const aoClicar = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a[href]');
      if (!link || (link as HTMLAnchorElement).target === '_blank') return;
      if (!window.confirm(MENSAGEM)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', antesDeSair);
    document.addEventListener('click', aoClicar, true);
    return () => {
      window.removeEventListener('beforeunload', antesDeSair);
      document.removeEventListener('click', aoClicar, true);
    };
  }, [sujo]);
}

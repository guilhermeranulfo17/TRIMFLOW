'use client';

import { useEffect } from 'react';
import { registrarFunil } from '@/server/actions/publico';

const CHAVE_SESSAO = 'orkestra:sessao';

/** Sessão anônima do funil (uuid no navegador; nenhum dado pessoal). */
export function sessaoDoFunil(): string {
  try {
    const atual = sessionStorage.getItem(CHAVE_SESSAO);
    if (atual) return atual;
    const nova = crypto.randomUUID();
    sessionStorage.setItem(CHAVE_SESSAO, nova);
    return nova;
  } catch {
    return crypto.randomUUID();
  }
}

/** Registra a visita à página do buffet (passo 0 do funil; Números conta as sessões). */
export function RegistroFunil({ slug, origem }: { slug: string; origem?: string }) {
  useEffect(() => {
    void registrarFunil(slug, { sessao: sessaoDoFunil(), passo: 0, evento: 'pagina_vista', origem });
  }, [slug, origem]);
  return null;
}

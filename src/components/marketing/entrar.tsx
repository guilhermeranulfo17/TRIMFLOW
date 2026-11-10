'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/** Sessão do Supabase no navegador (só a presença do cookie, sem rede e sem ler o conteúdo). */
function temSessao(): boolean {
  try {
    return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(document.cookie);
  } catch {
    return false;
  }
}

/** Único link do topo: "Entrar" ou, para quem já está logado, "Ir para o painel". */
export function LinkEntrar() {
  const [logado, setLogado] = useState(false);
  useEffect(() => setLogado(temSessao()), []);
  return (
    <Link
      href={logado ? '/app/leads' : '/login'}
      className="focus-visible:ring-ring/60 -mr-3 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-white/80 transition-colors hover:text-white focus-visible:ring-[3px] focus-visible:outline-none"
      data-testid={logado ? 'ir-para-painel' : 'entrar'}
    >
      {logado ? 'Ir para o painel' : 'Entrar'}
    </Link>
  );
}

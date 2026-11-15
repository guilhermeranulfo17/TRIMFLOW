'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { mostraBotaoOrcamento } from './botao-orcamento-rotas';

/**
 * Único botão primário fixo do painel: "+ Orçamento" (orçamento interno). Aparece só nas telas
 * comerciais (`mostraBotaoOrcamento`).
 */
export function BotaoOrcamento() {
  const caminho = usePathname();
  if (!mostraBotaoOrcamento(caminho)) return null;
  return (
    <div className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 md:right-8 md:bottom-8">
      <Button asChild size="lg" className="shadow-lg">
        <Link href="/app/orcamentos/novo" aria-label="Novo orçamento">
          <Plus aria-hidden />
          Orçamento
        </Link>
      </Button>
    </div>
  );
}

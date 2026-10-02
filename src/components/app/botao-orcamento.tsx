'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * Único botão primário fixo do painel: "+ Orçamento" (orçamento interno). Some dentro das telas
 * de orçamento, que têm o próprio resumo fixo no rodapé.
 */
export function BotaoOrcamento() {
  const caminho = usePathname();
  // Some nas telas de orçamento (resumo fixo) e no lead (barra de ações com "Novo orçamento").
  if (caminho.startsWith('/app/orcamentos') || /^\/app\/leads\/[^/]+/.test(caminho)) return null;
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

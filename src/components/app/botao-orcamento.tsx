'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Único botão primário fixo do painel. Desabilitado nesta etapa (orçamento interno vem depois).
 * O wrapper focável permite mostrar o tooltip mesmo com o botão desabilitado.
 */
export function BotaoOrcamento() {
  return (
    <div className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 md:right-8 md:bottom-8">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="rounded-control inline-flex"
            aria-describedby="orcamento-em-breve"
          >
            <Button
              size="lg"
              disabled
              className="shadow-lg"
              aria-label="Novo orçamento (disponível em breve)"
            >
              <Plus aria-hidden />
              Orçamento
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" id="orcamento-em-breve">
          Disponível em breve
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

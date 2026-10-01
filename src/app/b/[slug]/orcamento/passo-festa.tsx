'use client';

import { Check } from 'lucide-react';
import { classeOpcao } from '@/components/orcamento/contador';
import type { PropsPasso } from './tipos';

/** Passo 1: qual festa. */
export default function PassoFesta({ vitrine, escolhas, alterar }: PropsPasso) {
  return (
    <fieldset>
      <legend className="sr-only">Tipo de festa</legend>
      <div className="flex flex-col gap-3" role="radiogroup">
        {vitrine.tiposEvento.map((t) => {
          const marcado = escolhas.tipoEventoId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={marcado}
              onClick={() => alterar({ tipoEventoId: t.id, pacoteId: undefined, opcionais: [] })}
              className={classeOpcao(marcado)}
            >
              <span className="flex-1 text-base font-bold">{t.nome}</span>
              {marcado && <Check className="size-5 text-[var(--marca-destaque)]" aria-hidden />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

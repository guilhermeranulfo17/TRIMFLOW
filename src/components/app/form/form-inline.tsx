'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAvisoAlteracoes } from '../use-aviso-alteracoes';

/** Formulário dentro de um card da lista (editar inline), com Salvar e Cancelar. */
export function FormInline({
  onSubmit,
  onCancelar,
  salvando = false,
  sujo = false,
  somenteLeitura = false,
  textoBotao = 'Salvar',
  children,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancelar: () => void;
  salvando?: boolean;
  sujo?: boolean;
  somenteLeitura?: boolean;
  textoBotao?: string;
  children: React.ReactNode;
}) {
  useAvisoAlteracoes(sujo && !somenteLeitura);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <fieldset disabled={somenteLeitura || salvando} className="min-w-0 space-y-4">
        {children}
      </fieldset>
      {!somenteLeitura && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={salvando} onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando} className="min-w-28">
            {salvando && <Loader2 className="animate-spin" aria-hidden />}
            {salvando ? 'Salvando…' : textoBotao}
          </Button>
        </div>
      )}
    </form>
  );
}

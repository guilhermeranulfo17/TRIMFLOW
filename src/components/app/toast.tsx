'use client';

import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { pedeIrAoPlano } from '@/domain/cobranca/limites';
import { cn } from '@/lib/utils';

type Toast = {
  id: number;
  tipo: 'sucesso' | 'erro';
  mensagem: string;
  /** ação otimista que ainda pode ser desfeita (botão "Desfazer" por alguns segundos) */
  desfazer?: () => void;
};
type ApiToast = {
  sucesso: (mensagem: string, opcoes?: { desfazer?: () => void }) => void;
  erro: (mensagem: string) => void;
};

const ContextoToast = createContext<ApiToast | null>(null);

/** Confirmações rápidas ("Salvo!") num lugar só da tela. Sem dependência externa. */
export function ProvedorToast({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const proximoId = useRef(1);

  const remover = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const adicionar = useCallback(
    (tipo: Toast['tipo'], mensagem: string, desfazer?: () => void) => {
      const id = proximoId.current++;
      setToasts((t) => [...t.slice(-2), { id, tipo, mensagem, desfazer }]);
      setTimeout(() => remover(id), tipo === 'erro' ? 7000 : desfazer ? 6000 : 4000);
    },
    [remover],
  );
  const api = useMemo<ApiToast>(
    () => ({
      sucesso: (m, o) => adicionar('sucesso', m, o?.desfazer),
      erro: (m) => adicionar('erro', m),
    }),
    [adicionar],
  );

  return (
    <ContextoToast.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4 md:top-auto md:right-6 md:bottom-6 md:left-auto md:items-end"
      >
        {toasts.map((t) => {
          const Icone = t.tipo === 'erro' ? CircleAlert : CircleCheck;
          return (
            <div
              key={t.id}
              role={t.tipo === 'erro' ? 'alert' : 'status'}
              data-testid="toast"
              className={cn(
                'rounded-card bg-card pointer-events-auto flex w-full max-w-sm items-start gap-2 border px-4 py-3 text-sm shadow-lg',
                t.tipo === 'erro' ? 'border-destructive/40 text-destructive' : 'border-success/40',
              )}
            >
              <Icone
                className={cn('mt-0.5 size-4 shrink-0', t.tipo === 'sucesso' && 'text-success')}
                aria-hidden
              />
              <span className="flex-1">
                {t.mensagem}
                {t.tipo === 'erro' && pedeIrAoPlano(t.mensagem) && (
                  <a
                    href="/app/empresa/plano"
                    className="text-foreground mt-1 block font-semibold underline underline-offset-2"
                  >
                    Ver planos
                  </a>
                )}
              </span>
              {t.desfazer && (
                <button
                  type="button"
                  onClick={() => {
                    remover(t.id);
                    t.desfazer?.();
                  }}
                  className="text-primary-texto font-semibold underline-offset-2 hover:underline"
                  data-testid="desfazer"
                >
                  Desfazer
                </button>
              )}
              <button
                type="button"
                onClick={() => remover(t.id)}
                aria-label="Fechar aviso"
                className="text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ContextoToast.Provider>
  );
}

export function useToast(): ApiToast {
  const api = useContext(ContextoToast);
  if (!api) throw new Error('useToast precisa estar dentro de <ProvedorToast>.');
  return api;
}

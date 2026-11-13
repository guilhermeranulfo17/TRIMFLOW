'use client';

import { useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import {
  criarApresentacaoInterna,
  entrarApresentacao,
  type ResultadoInterno,
} from '@/server/actions/interno';

const BOTAO = 'rounded-control min-h-11 border px-4 text-sm font-semibold disabled:opacity-60';

/** Botões de uma conta de apresentação: criar ou recriar do zero, e entrar como o dono. */
export function AcoesApresentacao({ chave, existe }: { chave: string; existe: boolean }) {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const rodar = (fn: () => Promise<ResultadoInterno | undefined>) =>
    iniciar(async () => {
      const r = await fn();
      if (!r) return;
      if (r.ok) toast.sucesso(r.mensagem);
      else toast.erro(r.erro);
    });

  return (
    <div className="flex flex-wrap gap-2">
      {existe && (
        <button
          type="button"
          disabled={pendente}
          className={`${BOTAO} bg-primary text-primary-foreground border-transparent`}
          onClick={() => rodar(() => entrarApresentacao(chave))}
          data-testid={`entrar-apresentacao-${chave}`}
        >
          Entrar
        </button>
      )}
      <button
        type="button"
        disabled={pendente}
        className={BOTAO}
        onClick={() => {
          if (
            existe &&
            !window.confirm(
              'Recriar apaga tudo o que foi mexido nesta conta e monta de novo com os dados de exemplo. Continuar?',
            )
          )
            return;
          rodar(() => criarApresentacaoInterna(chave));
        }}
        data-testid={`criar-apresentacao-${chave}`}
      >
        {pendente ? 'Aguarde…' : existe ? 'Recriar do zero' : 'Criar conta'}
      </button>
    </div>
  );
}

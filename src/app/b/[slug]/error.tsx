'use client';

import { RotateCcw } from 'lucide-react';

/** Erro inesperado na página pública: mensagem simples e tentar de novo. */
export default function ErroPublico({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-extrabold">Algo não carregou direito</h1>
      <p className="text-muted-foreground mt-2">
        Pode ser a sua conexão. Tente de novo; suas escolhas continuam salvas neste aparelho.
      </p>
      <button
        type="button"
        onClick={reset}
        className="bg-primary text-primary-foreground rounded-control mt-6 inline-flex min-h-12 items-center gap-2 px-5 font-bold"
      >
        <RotateCcw className="size-5" aria-hidden />
        Tentar de novo
      </button>
    </main>
  );
}

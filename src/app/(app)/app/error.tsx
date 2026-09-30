'use client';

import { Button } from '@/components/ui/button';

export default function ErroPainel({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="rounded-card bg-card mx-auto max-w-md border px-6 py-10 text-center">
      <h2 className="text-lg font-bold">Não foi possível abrir esta tela</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        Pode ser falta de permissão ou uma instabilidade. Tente de novo; se continuar, fale com o
        suporte.
      </p>
      <Button className="mt-6" onClick={reset}>
        Tentar de novo
      </Button>
    </section>
  );
}

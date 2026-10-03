import { cn } from '@/lib/utils';

/*
 * Esqueletos das telas do painel (loading.tsx): o formato real da tela, sem dado nenhum, para a
 * navegação mostrar algo na hora (o prefetch do Link já traz este pedaço).
 */

export function Bloco({ className }: { className?: string }) {
  return (
    <div
      className={cn('bg-muted animate-pulse rounded-md motion-reduce:animate-none', className)}
    />
  );
}

export function EsqueletoTela({
  rotulo,
  largura = 'max-w-3xl',
  children,
}: {
  rotulo: string;
  largura?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn('mx-auto flex flex-col gap-4', largura)}
      aria-busy="true"
      aria-label={rotulo}
      data-testid="esqueleto"
    >
      {children}
    </div>
  );
}

export function EsqueletoTitulo() {
  return <Bloco className="h-8 w-40" />;
}

export function EsqueletoCartoes({ n, className }: { n: number; className?: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Bloco key={i} className={cn('rounded-card', className)} />
      ))}
    </>
  );
}

/** Esqueleto genérico (lista de cartões), usado onde a tela não tem um próprio. */
export function EsqueletoLista({ rotulo }: { rotulo: string }) {
  return (
    <EsqueletoTela rotulo={rotulo}>
      <EsqueletoTitulo />
      <EsqueletoCartoes n={4} className="h-24" />
    </EsqueletoTela>
  );
}

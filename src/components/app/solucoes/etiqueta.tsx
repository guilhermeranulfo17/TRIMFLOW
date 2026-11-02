import { cn } from '@/lib/utils';

const TOM: Record<string, string> = {
  neutro: 'bg-muted text-muted-foreground border-border',
  alerta: 'bg-alerta/10 text-alerta border-alerta/30',
  sucesso: 'bg-sucesso/10 text-sucesso border-sucesso/30',
  erro: 'bg-erro/10 text-erro border-erro/30',
  info: 'bg-info/10 text-info border-info/30',
};

/** Etiqueta de situação da solução (tokens de estado do tema). */
export function EtiquetaSolucao({ texto, tom }: { texto: string; tom: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        TOM[tom] ?? TOM.neutro,
      )}
      data-testid="situacao-solucao"
    >
      {texto}
    </span>
  );
}

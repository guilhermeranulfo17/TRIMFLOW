import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { MODULOS, type CodigoModulo } from '@/domain/modulos';

/**
 * Aviso curto onde o módulo faria sentido, para quem não tem a solução ativa: o que ela faz e
 * "Conhecer". Sem pop-up e sem bloquear o que já é do plano.
 */
export function ChamadaModulo({ codigo, texto }: { codigo: CodigoModulo; texto?: string }) {
  const m = MODULOS[codigo];
  return (
    <aside
      className="bg-card rounded-card flex flex-wrap items-center justify-between gap-3 border border-dashed p-4"
      data-testid={`chamada-${codigo}`}
    >
      <p className="flex min-w-0 items-start gap-2 text-sm">
        <Sparkles className="text-primary-texto mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong>{m.nome}:</strong> {texto ?? m.explicacao}
        </span>
      </p>
      <Link
        href={`/app/solucoes/${codigo}`}
        className="hover:bg-accent inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold"
      >
        Conhecer
      </Link>
    </aside>
  );
}

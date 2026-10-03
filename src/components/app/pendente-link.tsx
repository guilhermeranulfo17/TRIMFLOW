'use client';

import { Loader2 } from 'lucide-react';
import { useLinkStatus } from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Dentro de um <Link>: gira enquanto a navigação daquele link está pendente. Resposta na hora ao
 * toque nas telas sem loading.tsx (filtros na URL; ARQUITETURA §60).
 */
export function PendenteLink({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <Loader2
      className={cn('size-3.5 shrink-0 animate-spin motion-reduce:animate-none', className)}
      aria-hidden
      data-testid="link-pendente"
    />
  );
}

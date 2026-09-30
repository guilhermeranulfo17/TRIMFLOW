import { Calculator } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Atalho fixo para o simulador, nas telas que mudam o preço (Catálogo e Regras). */
export function LinkTestarPrecos() {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/app/empresa/simulador">
        <Calculator aria-hidden />
        Testar preços
      </Link>
    </Button>
  );
}
